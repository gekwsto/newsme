function parseInline(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
}

export function markdownToHtml(md: string): string {
  const normalized = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);

  return blocks
    .map((block) => {
      const t = block.trim();
      if (!t) return '';

      if (t.startsWith('### ')) return `<h3>${parseInline(t.slice(4).trim())}</h3>`;
      if (t.startsWith('## ')) return `<h2>${parseInline(t.slice(3).trim())}</h2>`;
      if (t.startsWith('# ')) return `<h1>${parseInline(t.slice(2).trim())}</h1>`;
      if (/^[-*]{3,}$/.test(t)) return '<hr>';

      if (t.startsWith('> ')) {
        const content = t.split('\n').map((l) => l.replace(/^>\s?/, '')).join('<br>');
        return `<blockquote>${parseInline(content)}</blockquote>`;
      }

      const lines = t.split('\n');
      if (lines.every((l) => /^[-*]\s/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${parseInline(l.replace(/^[-*]\s/, ''))}</li>`).join('')}</ul>`;
      }
      if (lines.every((l) => /^\d+\.\s/.test(l))) {
        return `<ol>${lines.map((l) => `<li>${parseInline(l.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`;
      }

      return `<p>${lines.map(parseInline).join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}
