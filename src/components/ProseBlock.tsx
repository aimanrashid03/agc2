import { formatProse } from '@/lib/formatProse';

/**
 * Renders a wall of legal narrative as readable, evenly-spaced paragraphs via `formatProse`.
 * No client hooks → safe to use in both server components (case detail page) and client
 * components (CaseContentTabs). `className` controls type scale/colour on the wrapper;
 * paragraph rhythm (spacing + line-height) is fixed here for consistency across the app.
 */
export default function ProseBlock({
    text,
    className = '',
}: {
    text: string | null | undefined;
    className?: string;
}) {
    const paragraphs = formatProse(text);
    if (paragraphs.length === 0) return null;

    return (
        <div className={className}>
            {paragraphs.map((paragraph, i) => (
                <p key={i} className="mb-4 leading-7 last:mb-0">
                    {paragraph}
                </p>
            ))}
        </div>
    );
}
