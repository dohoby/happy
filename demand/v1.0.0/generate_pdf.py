#!/usr/bin/env python3
"""
将Markdown格式的UE需求文档转换为PDF
使用 markdown 库生成HTML，再用 Chrome headless 打印PDF
"""

import subprocess
import sys
import os
import markdown
from pathlib import Path

def md_to_html(md_file, html_file):
    """将Markdown文件转换为带样式的HTML文件"""

    with open(md_file, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # 转换Markdown为HTML
    html_body = markdown.markdown(
        md_content,
        extensions=['tables', 'fenced_code', 'toc', 'nl2br'],
        extension_configs={
            'toc': {'title': '目录'}
        }
    )

    # 构建完整的HTML文档，包含CSS样式
    html_template = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>幼小衔接H5教程 - UE需求设计文档</title>
<style>
@page {{
    size: A4;
    margin: 20mm 18mm 25mm 18mm;
}}

* {{
    box-sizing: border-box;
}}

body {{
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif;
    font-size: 10.5pt;
    line-height: 1.7;
    color: #2c3e50;
    background: #fff;
    max-width: 100%;
    margin: 0;
    padding: 0;
}}

/* 标题样式 */
h1 {{
    font-size: 22pt;
    font-weight: 700;
    color: #1a2a3a;
    border-bottom: 3px solid #2c3e50;
    padding-bottom: 12px;
    margin-top: 30px;
    margin-bottom: 20px;
    page-break-after: avoid;
}}

h2 {{
    font-size: 16pt;
    font-weight: 600;
    color: #2c3e50;
    border-left: 4px solid #e67e22;
    padding-left: 12px;
    margin-top: 25px;
    margin-bottom: 15px;
    page-break-after: avoid;
}}

h3 {{
    font-size: 13pt;
    font-weight: 600;
    color: #3d566e;
    margin-top: 20px;
    margin-bottom: 10px;
    page-break-after: avoid;
}}

h4 {{
    font-size: 11pt;
    font-weight: 600;
    color: #2c3e50;
    margin-top: 15px;
    margin-bottom: 8px;
}}

/* 段落 */
p {{
    margin: 8px 0;
    text-align: justify;
}}

/* 引用块 */
blockquote {{
    margin: 12px 0;
    padding: 10px 16px;
    background: #faf8f3;
    border-left: 3px solid #e67e22;
    color: #3d566e;
    font-size: 10pt;
}}

blockquote p {{
    margin: 4px 0;
}}

/* 代码块 */
pre {{
    background: #1a2a3a;
    color: #f5f0e8;
    padding: 14px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.5;
    page-break-inside: avoid;
}}

code {{
    font-family: "SF Mono", "Consolas", "Monaco", "Courier New", monospace;
    font-size: 9pt;
}}

pre code {{
    background: none;
    padding: 0;
    color: #f5f0e8;
}}

:not(pre) > code {{
    background: #f5f0e8;
    padding: 2px 6px;
    border-radius: 4px;
    color: #c0392b;
    font-size: 9.5pt;
}}

/* 表格 */
table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
}}

th {{
    background: #2c3e50;
    color: #fff;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    border: 1px solid #2c3e50;
}}

td {{
    padding: 7px 10px;
    border: 1px solid #e8e0d0;
    vertical-align: top;
}}

tr:nth-child(even) {{
    background: #faf8f3;
}}

tr:hover {{
    background: #f5f0e8;
}}

/* 列表 */
ul, ol {{
    margin: 8px 0;
    padding-left: 24px;
}}

li {{
    margin: 4px 0;
}}

/* 分隔线 */
hr {{
    border: none;
    border-top: 1px solid #e8e0d0;
    margin: 20px 0;
}}

/* 强调 */
strong {{
    font-weight: 600;
    color: #1a2a3a;
}}

em {{
    font-style: italic;
    color: #6b8299;
}}

/* 链接 */
a {{
    color: #2980b9;
    text-decoration: none;
}}

a:hover {{
    text-decoration: underline;
}}

/* 打印优化 */
.page-break {{
    page-break-before: always;
}}

.avoid-break {{
    page-break-inside: avoid;
}}
</style>
</head>
<body>
{html_body}
</body>
</html>'''

    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_template)

    print(f"HTML 已生成: {html_file}")
    return html_file


def html_to_pdf(html_file, pdf_file):
    """使用 Chrome headless 将HTML转为PDF"""

    chrome_path = r"C:\Users\hoby\AppData\Local\Google\Chrome\Application\chrome.exe"

    # 使用绝对路径
    abs_html = os.path.abspath(html_file)
    abs_pdf = os.path.abspath(pdf_file)
    file_url = "file:///" + abs_html.replace(chr(92), "/")

    cmd = [
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-web-security",
        "--run-all-compositor-stages-before-draw",
        "--print-to-pdf-no-header",
        f"--print-to-pdf={abs_pdf}",
        file_url
    ]

    print(f"正在生成 PDF: {pdf_file}")

    # 不使用 text=True 避免编码问题
    result = subprocess.run(cmd, capture_output=True, timeout=60)

    # 检查PDF是否生成
    if os.path.exists(abs_pdf) and os.path.getsize(abs_pdf) > 1000:
        size_kb = os.path.getsize(abs_pdf) / 1024
        print(f"PDF 生成成功: {pdf_file} ({size_kb:.1f} KB)")
        return True
    else:
        print(f"Chrome stderr: {result.stderr[:500] if result.stderr else 'N/A'}")
        return False


def main():
    base_dir = Path(__file__).parent.absolute()
    md_file = base_dir / "UE_Design.md"
    html_file = base_dir / "UE_Design.html"
    pdf_file = base_dir / "幼小衔接H5教程_UE需求设计.pdf"

    # 尝试多种文件名编码
    candidates = [
        base_dir / "幼小衔接H5教程_UE需求设计.md",
        base_dir / "UE_Design.md",
    ]

    md_file = None
    for c in candidates:
        if c.exists():
            md_file = c
            break

    if not md_file:
        # 列出目录内容
        print("目录内容:")
        for f in base_dir.iterdir():
            print(f"  {f.name}")
        print(f"错误: 找不到 Markdown 文件")
        sys.exit(1)

    print(f"使用文件: {md_file}")

    # 步骤1: Markdown -> HTML
    md_to_html(str(md_file), str(html_file))

    # 步骤2: HTML -> PDF
    success = html_to_pdf(str(html_file), str(pdf_file))

    if success:
        print("\n完成!")
        print(f"   PDF: {pdf_file}")
        print(f"   HTML: {html_file}")
    else:
        print("\nPDF 生成失败，但 HTML 文件可用")
        sys.exit(1)


if __name__ == "__main__":
    main()
