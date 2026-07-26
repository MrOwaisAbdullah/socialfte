import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import CopyButton from './CopyButton';
import SourceBadge from './SourceBadge';
import styles from '../styles/ChatWidget.module.css';

interface MessageRendererProps {
  content: string;
  sources?: Array<{
    chapter: string;
    section?: string;
    url?: string;
  }>;
  isStreaming?: boolean;
  className?: string;
}

// Memoize the MessageRenderer to prevent unnecessary re-renders during streaming
function MessageRenderer({
  content,
  sources,
  isStreaming = false,
  className = ""
}: MessageRendererProps) {
  return (
    <div className={`${styles.messageRenderer} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block renderer with syntax highlighting
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (!inline && language) {
              return (
                <div className={styles.codeBlockContainer}>
                  <div className={styles.codeBlockHeader}>
                    <span className={styles.codeLanguage}>{language}</span>
                    <CopyButton text={String(children).replace(/\n$/, '')} />
                  </div>
                  <SyntaxHighlighter
                    style={tomorrow}
                    language={language}
                    PreTag="div"
                    className={styles.codeBlock}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // Inline code
            return (
              <code className={styles.inlineCode} {...props}>
                {children}
              </code>
            );
          },

          // Custom link renderer with security attributes
          a({ node, children, href, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={styles.externalLink}
                {...props}
              >
                {children}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={styles.linkIcon}
                  aria-hidden="true"
                >
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <path d="M15 3h6v6"/>
                  <path d="M10 14L21 3"/>
                </svg>
              </a>
            );
          },

          // Custom list renderers
          ul({ node, children, ...props }) {
            return (
              <ul className={styles.unorderedList} {...props}>
                {children}
              </ul>
            );
          },

          ol({ node, children, ...props }) {
            return (
              <ol className={styles.orderedList} {...props}>
                {children}
              </ol>
            );
          },

          li({ node, children, ...props }) {
            return (
              <li className={styles.listItem} {...props}>
                {children}
              </li>
            );
          },

          // Custom heading renderers
          h1({ node, children, ...props }) {
            return (
              <h1 className={styles.heading1} {...props}>
                {children}
              </h1>
            );
          },

          h2({ node, children, ...props }) {
            return (
              <h2 className={styles.heading2} {...props}>
                {children}
              </h2>
            );
          },

          h3({ node, children, ...props }) {
            return (
              <h3 className={styles.heading3} {...props}>
                {children}
              </h3>
            );
          },

          // Custom paragraph renderer
          p({ node, children, ...props }) {
            return (
              <p className={styles.paragraph} {...props}>
                {children}
              </p>
            );
          },

          // Custom blockquote renderer
          blockquote({ node, children, ...props }) {
            return (
              <blockquote className={styles.blockquote} {...props}>
                {children}
              </blockquote>
            );
          },

          // Custom table renderers for GitHub-flavored markdown
          table({ node, children, ...props }) {
            return (
              <div className={styles.tableContainer}>
                <table className={styles.table} {...props}>
                  {children}
                </table>
              </div>
            );
          },

          thead({ node, children, ...props }) {
            return (
              <thead className={styles.tableHead} {...props}>
                {children}
              </thead>
            );
          },

          tbody({ node, children, ...props }) {
            return (
              <tbody className={styles.tableBody} {...props}>
                {children}
              </tbody>
            );
          },

          tr({ node, children, ...props }) {
            return (
              <tr className={styles.tableRow} {...props}>
                {children}
              </tr>
            );
          },

          th({ node, children, ...props }) {
            return (
              <th className={styles.tableHeader} {...props}>
                {children}
              </th>
            );
          },

          td({ node, children, ...props }) {
            return (
              <td className={styles.tableCell} {...props}>
                {children}
              </td>
            );
          },

          // Custom emphasis renderers
          strong({ node, children, ...props }) {
            return (
              <strong className={styles.bold} {...props}>
                {children}
              </strong>
            );
          },

          em({ node, children, ...props }) {
            return (
              <em className={styles.italic} {...props}>
                {children}
              </em>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Source badges */}
      {sources && sources.length > 0 && (
        <div className={styles.sourceBadges} role="group" aria-label="Sources">
          {sources.map((source, index) => (
            <SourceBadge
              key={index}
              chapter={source.chapter}
              section={source.section}
              url={source.url}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Export the memoized component
export default React.memo(MessageRenderer);