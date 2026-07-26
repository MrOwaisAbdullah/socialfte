/**
 * Discord webhook endpoint — Week 3, Step 8.
 * 
 * Handles Discord interactions:
 * - Type 1 (PING → PONG) — required for endpoint verification
 * - Type 3 (button click → update post state in DB)
 * 
 * Ed25519 signature verification is mandatory — Discord disables the endpoint if it fails.
 * Uses the `tweetnacl` package for signature verification.
 */
import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { db } from "@/lib/db";
import { posts, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    // Handle edit action — send a message asking for new caption
    if (action === "edit" && postId) {
      try {
        // Set a pending_edit flag (using audit log for now)
        await db.insert(auditLog).values({
          actor: "discord_webhook",
          action: "pending_edit",
          subjectId: postId,
          payload: {
            discordUserId: interaction.member?.user?.id,
            discordUsername: interaction.member?.user?.username,
            requestedAt: new Date().toISOString(),
          },
        });

        // Return a message asking for the new caption
        return NextResponse.json({
          type: 4, // CHANNEL_MESSAGE
          data: {
            content: `Reply with the new caption for post ${postId}:`,
            flags: 64, // EPHEMERAL
          },
        });
      } catch (error) {
        console.error("Failed to set pending edit:", error);
        return NextResponse.json({ type: 6 }); // ACKNOWLEDGE
      }
    }

    // Unknown action — just acknowledge
    return NextResponse.json({ type: 6 });
  }

  // Unknown interaction type — acknowledge
  return NextResponse.json({ type: 6 });
}
