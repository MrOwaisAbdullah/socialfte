/**
 * Dynamic Route with ISR Template
 *
 * Copy this template for content detail pages (blog posts, products, etc.)
 * Adjust the schema type and query as needed.
 */

import { client } from "@/sanity/lib/client"
import { urlFor } from "@/sanity/lib/image"
import { Metadata } from "next"
import { PortableText } from '@portabletext/react'

// ISR: Revalidate every 60 seconds (adjust as needed)
export const revalidate = 60

export const dynamicParams = true

// Generate static params for all content
export async function generateStaticParams() {
  const query = `*[_type == "post"]{
    "slug": slug.current
  }`

  const slugs = await client.fetch(query)

  return slugs.map((slug: { slug: string }) => ({ slug: slug.slug }))
}

// Generate SEO metadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const query = `*[_type == "post" && slug.current == "${slug}"]{
    title,
    summary,
    mainImage,
    seoTitle,
    seoDescription,
    publishedAt
  }[0]`

  const post = await client.fetch(query)

  if (!post) {
    return {
      title: "Content Not Found",
    }
  }

  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.summary,
    openGraph: {
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.summary,
      url: `https://yourdomain.com/blog/${slug}`,
      type: "article",
      publishedTime: post.publishedAt,
      images: [
        {
          url: urlFor(post.mainImage).width(1200).height(630).url(),
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.summary,
      images: [urlFor(post.mainImage).url()],
    },
    alternates: {
      canonical: `/blog/${slug}`,
    },
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Fetch content with all fields needed
  const query = `*[_type == "post" && slug.current == "${slug}"]{
    title,
    slug,
    summary,
    content,
    mainImage,
    author->{name, slug, bio},
    categories[]->{title, slug},
    faqs,
    publishedAt,
    _createdAt,
    _updatedAt
  }[0]`

  const post = await client.fetch(query)

  if (!post) {
    return <div>Content not found</div>
  }

  return (
    <article>
      {/* Header */}
      <header>
        <h1>{post.title}</h1>
        <p>{post.summary}</p>
        {post.author && <p>By {post.author.name}</p>}
        <time dateTime={post.publishedAt}>
          {new Date(post.publishedAt).toLocaleDateString()}
        </time>
      </header>

      {/* Featured Image */}
      {post.mainImage && (
        <img
          src={urlFor(post.mainImage).url()}
          alt={post.mainImage.alt}
          className="w-full"
        />
      )}

      {/* Categories */}
      {post.categories && (
        <ul>
          {post.categories.map((category: any) => (
            <li key={category.slug}>{category.title}</li>
          ))}
        </ul>
      )}

      {/* Content */}
      <PortableText
        value={post.content}
        components={{
          types: {
            image: ({ value }) => (
              <img
                src={urlFor(value).url()}
                alt={value.alt}
                className="rounded-lg"
              />
            ),
          },
        }}
      />

      {/* FAQs */}
      {post.faqs && post.faqs.length > 0 && (
        <section>
          <h2>Frequently Asked Questions</h2>
          {post.faqs.map((faq: any, index: number) => (
            <details key={index}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </section>
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.summary,
            image: urlFor(post.mainImage).url(),
            author: {
              "@type": "Person",
              name: post.author.name,
            },
            datePublished: post.publishedAt,
            dateModified: post._updatedAt,
          }),
        }}
      />
    </article>
  )
}
