export type MarkdownSection = {
  title: string;
  markdown: string;
};

export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: MarkdownSection[] = [];
  let title = "报告概览";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) sections.push({ title, markdown: content });
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      title = line.slice(3).trim() || "未命名章节";
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections.length
    ? sections
    : [{ title: "报告概览", markdown: markdown.trim() }].filter(
        (section) => section.markdown,
      );
}
