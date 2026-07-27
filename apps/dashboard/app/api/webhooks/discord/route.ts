/**
 * Discord webhook endpoint — Week 3, Step 8.
 *
 * Handles Discord interactions:
 * - Type 1 (PING → PONG) — required for endpoint verification
 * - Type 3 (button click → update post state in DB, or open the Edit modal)
 * - Type 5 (MODAL_SUBMIT → write the new caption to posts.caption)
 *
 * Ed25519 signature verification is mandatory — Discord disables the endpoint if it fails.
 * Uses the `tweetnacl` package for signature verification.
 *
 * The Edit flow uses a Discord modal rather than "reply in the channel and we'll
 * read it" — the Interactions webhook this route implements only ever receives
 * interaction events (buttons, modals), never arbitrary channel messages. Reading
 * a plain-text reply would require a separate, persistent Gateway-bot connection;
 * a modal collects the same freeform text without leaving the webhook model.
 */
import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { db } from "@/lib/db/client";
import { posts, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const CAPTION_MAX = 2200; // matches TikTok's title limit; comfortably under every platform's cap

/**
 * POST /api/webhooks/discord
 * 
 * Receives Discord interactions (button clicks, PING).
 * Must respond with correct status codes or Discord disables the endpoint.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text();

  // Validate required headers
  if (!signature || !timestamp) {
    return new Response("Missing signature headers", { status: 401 });
  }

  // Ed25519 signature verification — MANDATORY
  // Discord disables the endpoint if verification fails repeatedly
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.error("DISCORD_PUBLIC_KEY not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  const isValid = nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex")
  );

  if (!isValid) {
    console.error("Invalid Discord signature");
    return new Response("Bad signature", { status: 401 });
  }

  // Parse the interaction
  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Type 1: PING → PONG (required for endpoint verification)
  // Discord sends this when you save the endpoint and periodically after
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Type 3: BUTTON_CLICK
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id;
    if (!customId) {
      return NextResponse.json({ type: 6 }); // ACKNOWLEDGE
    }

    const [action, postId] = customId.split(":");
    
    // Handle approve/skip/edit actions
    const stateMap: Record<string, string> = {
      approve: "approved",
      skip: "skipped",
    };

    const newState = stateMap[action];
    if (newState && postId) {
      try {
        // Update the post state in the database
        await db
          .update(posts)
          .set({
            state: newState,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, postId));

        // Write audit log
        await db.insert(auditLog).values({
          actor: "discord_webhook",
          action: `post_${newState}`,
          subjectId: postId,
          payload: {
            discordUserId: interaction.member?.user?.id,
            discordUsername: interaction.member?.user?.username,
            action,
          },
        });

        // Return UPDATE_MESSAGE to edit the original card in place
        return NextResponse.json({
          type: 7, // UPDATE_MESSAGE
          data: {
            content: `**${action.toUpperCase()}D**`,
            components: [], // Remove buttons after action
          },
        });
      } catch (error) {
        console.error("Failed to update post state:", error);
        return NextResponse.json({
          type: 4, // CHANNEL_MESSAGE
          data: {
            content: `Failed to update post: ${error}`,
            flags: 64, // EPHEMERAL
          },
        });
      }
    }

    // Handle edit action — open a modal pre-filled with the current caption
    if (action === "edit" && postId) {
      try {
        const [post] = await db
          .select({ caption: posts.caption })
          .from(posts)
          .where(eq(posts.id, postId));

        return NextResponse.json({
          type: 9, // MODAL
          data: {
            custom_id: `edit_modal:${postId}`,
            title: "Edit caption",
            components: [
              {
                type: 18, // Label — Action Row + Text Input is deprecated in modals
                label: "New caption",
                component: {
                  type: 4, // Text Input
                  custom_id: "new_caption",
                  style: 2, // Paragraph (multi-line)
                  value: post?.caption ?? "",
                  max_length: CAPTION_MAX,
                  required: true,
                },
              },
            ],
          },
        });
      } catch (error) {
        console.error("Failed to open edit modal:", error);
        return NextResponse.json({ type: 6 }); // ACKNOWLEDGE
      }
    }

    // Unknown action — just acknowledge
    return NextResponse.json({ type: 6 });
  }

  // Type 5: MODAL_SUBMIT — the Edit modal was submitted
  if (interaction.type === 5) {
    const customId = interaction.data?.custom_id ?? "";
    const [modalAction, postId] = customId.split(":");

    if (modalAction !== "edit_modal" || !postId) {
      return NextResponse.json({ type: 6 }); // ACKNOWLEDGE
    }

    // Modal Submit Data Structure: components is an array of Label wrappers,
    // each holding one `component` with the submitted `value`.
    const newCaption: string | undefined =
      interaction.data?.components?.[0]?.component?.value;

    if (typeof newCaption !== "string") {
      return NextResponse.json({
        type: 4,
        data: { content: "No caption text received — nothing was changed.", flags: 64 },
      });
    }

    try {
      await db
        .update(posts)
        .set({ caption: newCaption, updatedAt: new Date() })
        .where(eq(posts.id, postId));

      await db.insert(auditLog).values({
        actor: "discord_webhook",
        action: "caption_edited",
        subjectId: postId,
        payload: {
          discordUserId: interaction.member?.user?.id,
          discordUsername: interaction.member?.user?.username,
          captionLength: newCaption.length,
        },
      });

      // Modals opened from a button carry the original message on `interaction.message`.
      // Re-render its embed with the new caption in place, keeping the Approve/Edit/Skip
      // buttons intact — editing isn't a terminal state, the post still needs a decision.
      const originalMessage = interaction.message;
      const originalEmbed = originalMessage?.embeds?.[0];

      if (originalEmbed) {
        return NextResponse.json({
          type: 7, // UPDATE_MESSAGE
          data: {
            embeds: [{ ...originalEmbed, description: newCaption }],
            components: originalMessage.components,
          },
        });
      }

      // No original message to update against (shouldn't normally happen) — just confirm.
      return NextResponse.json({
        type: 4,
        data: { content: "Caption updated.", flags: 64 },
      });
    } catch (error) {
      console.error("Failed to save edited caption:", error);
      return NextResponse.json({
        type: 4,
        data: { content: `Failed to save caption: ${error}`, flags: 64 },
      });
    }
  }

  // Unknown interaction type — acknowledge
  return NextResponse.json({ type: 6 });
}
