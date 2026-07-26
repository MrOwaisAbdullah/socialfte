/**
 * API Route Template with Caching
 *
 * Copy this template for API routes that fetch Sanity content.
 * Adjust caching strategy based on content change frequency.
 */

import { client } from "@/sanity/lib/client"
import { NextResponse } from "next/server"

// Force static generation for better performance
export const dynamic = "force-static"

/**
 * GET handler for fetching content
 *
 * Caching strategies:
 * - force-static: Generate at build time, no dynamic requests
 * - ISR (revalidate): Regenerate at specified intervals
 * - On-demand: Use revalidateTag() for manual revalidation
 */

export async function GET() {
  try {
    // Always use projections for better performance
    const query = `*[_type == "post"] | order(_createdAt desc){
      title,
      slug,
      summary,
      mainImage{
        asset->{url},
        alt
      },
      _createdAt,
      author->{name},
      categories[]->{title, "slug": slug.current}
    }`

    const posts = await client.fetch(query)

    // Cache headers for optimal performance
    // s-maxage: CDN cache duration (in seconds)
    // stale-while-revalidate: Serve stale content while revalidating
    return NextResponse.json(posts, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error("Error fetching content:", error)
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    )
  }
}

/**
 * Alternative: Tag-based revalidation (Next.js 15+)
 *
 * For on-demand revalidation when content changes in Sanity Studio
 */

/*
import { revalidateTag } from 'next/cache'
import { client } from "@/sanity/lib/client"

export async function GET() {
  try {
    const posts = await client.fetch(
      `*[_type == "post"] | order(_createdAt desc){
        title,
        slug,
        summary,
        mainImage
      }`,
      {
        // Use next: { tags } for automatic revalidation
        next: { tags: ['posts'] },
      }
    )

    return NextResponse.json(posts)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    )
  }
}
*/

/**
 * Server Action for revalidation
 * Use this to trigger revalidation from user actions (e.g., after CMS update)
 */

'use server'

import { revalidateTag } from 'next/cache'
import { client } from "@/sanity/lib/client"

export async function revalidateContent(contentType: string, slug: string) {
  try {
    // Fetch the content to trigger revalidation
    await client.fetch(
      `*[_type == "${contentType}" && slug.current == "${slug}"]`,
      {
        cache: 'no-store',
        next: { tags: [`${contentType}:${slug}`] },
      }
    )

    // Revalidate the tag
    revalidateTag(`${contentType}:${slug}`)

    return { success: true }
  } catch (error) {
    console.error("Revalidation failed:", error)
    return { success: false, error: "Revalidation failed" }
  }
}
