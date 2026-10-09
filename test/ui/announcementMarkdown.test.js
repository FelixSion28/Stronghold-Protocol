// Announcement Markdown: visible syntax, fixed vnode output, URL safety and bounded parsing.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AnnouncementMarkdown, parseAnnouncementMarkdown, safeAnnouncementHref, ANNOUNCEMENT_MARKDOWN_LIMITS,
} from '../../public/js/ui/announcementMarkdown.js';

const textOf = (value) => {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join('');
  return textOf(value.props?.children);
};
const elements = (value) => {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== 'object') return [];
  return [value, ...elements(value.props?.children)];
};
const render = (source) => AnnouncementMarkdown({ source });
const blocks = (source) => parseAnnouncementMarkdown(source).blocks;
const paragraph = (source) => blocks(source)[0].children;

describe('announcement Markdown subset', () => {
  test('paragraphs preserve Chinese text, CRLF and each visible line break', () => {
    assert.deepEqual(blocks('第一行\r\n第二行\r\n\r\n第三段\r末行'), [
      { type: 'paragraph', children: [{ type: 'text', text: '第一行' }, { type: 'break' }, { type: 'text', text: '第二行' }] },
      { type: 'paragraph', children: [{ type: 'text', text: '第三段' }, { type: 'break' }, { type: 'text', text: '末行' }] },
    ]);
    assert.equal(elements(render('第一行\n第二行')).filter((v) => v.type === 'br').length, 1);
  });

  test('all six ATX heading levels render actual headings and preserve invalid headings', () => {
    const source = Array.from({ length: 6 }, (_, i) => `${'#'.repeat(i + 1)} 第${i + 1}级 ##`).join('\n');
    assert.deepEqual(blocks(source).map((b) => [b.type, b.level, b.children[0].text]),
      Array.from({ length: 6 }, (_, i) => ['heading', i + 1, `第${i + 1}级`]));
    assert.deepEqual(elements(render(source)).filter((v) => /^h[1-6]$/.test(v.type)).map((v) => v.type),
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    assert.equal(textOf(render('####### 超出六级\n#没有空格')), '####### 超出六级#没有空格');
  });

  test('strong and emphasis nest, while underscores inside words remain text', () => {
    assert.deepEqual(paragraph('**粗体 *斜体*** 与 _强调_，file_name_test'), [
      { type: 'strong', children: [{ type: 'text', text: '粗体 ' }, { type: 'em', children: [{ type: 'text', text: '斜体' }] }] },
      { type: 'text', text: ' 与 ' }, { type: 'em', children: [{ type: 'text', text: '强调' }] },
      { type: 'text', text: '，file_name_test' },
    ]);
    assert.equal(elements(render('***粗斜体***')).filter((v) => ['strong', 'em'].includes(v.type)).length, 2);
    assert.equal(textOf(render('未闭合 **标记')), '未闭合 **标记');
  });

  test('backslash escapes keep literal punctuation and inline code stays literal', () => {
    assert.deepEqual(paragraph('\\*普通\\*，`<img src=x> **代码**`，``含 ` 反引号``'), [
      { type: 'text', text: '*普通*，' }, { type: 'code', text: '<img src=x> **代码**' },
      { type: 'text', text: '，' }, { type: 'code', text: '含 ` 反引号' },
    ]);
    assert.equal(textOf(render('尾部\\')), '尾部\\');
  });

  test('ordered/unordered lists retain ordered start, nested items and continuations', () => {
    const parsed = blocks('- 第一项\n  续行\n  - 子项\n- 第二项\n\n3. 第三\n4. 第四');
    assert.deepEqual(parsed.map((b) => [b.type, b.ordered, b.start, b.items.length]),
      [['list', false, undefined, 2], ['list', true, 3, 2]]);
    assert.equal(parsed[0].items[0][1].type, 'list');
    assert.deepEqual(parsed[0].items[0][0].children,
      [{ type: 'text', text: '第一项' }, { type: 'break' }, { type: 'text', text: '续行' }]);
    assert.equal(elements(render('3. 第三\n4. 第四')).find((v) => v.type === 'ol').props.start, 3);
    assert.equal(elements(render('- 第一\n\n- 第二')).filter((v) => v.type === 'li').length, 2);
  });

  test('quotes contain block syntax and rules accept spaced markers', () => {
    const parsed = blocks('> # 引用标题\n>\n> - 一项\n\n---\n\n* * *\n\n___');
    assert.equal(parsed[0].type, 'quote');
    assert.deepEqual(parsed[0].blocks.map((b) => b.type), ['heading', 'list']);
    assert.deepEqual(parsed.slice(1).map((b) => b.type), ['rule', 'rule', 'rule']);
    assert.equal(elements(render('> > 嵌套引用')).filter((v) => v.type === 'blockquote').length, 2);
  });

  test('fenced code never renders inner Markdown/HTML and closes only matching fences', () => {
    const source = '```js\n<script>alert(1)</script>\n[x](javascript:alert(1))\n~~~\n````\n\n后文';
    const parsed = blocks(source);
    assert.deepEqual(parsed[0], { type: 'codeBlock', language: 'js',
      text: '<script>alert(1)</script>\n[x](javascript:alert(1))\n~~~' });
    assert.equal(parsed[1].type, 'paragraph');
    const output = render(source), tags = elements(output).map((v) => v.type);
    assert.ok(tags.includes('pre') && tags.includes('code'));
    assert.ok(!tags.includes('script') && !tags.includes('a'));
    assert.equal(elements(output).find((v) => v.type === 'code').props['data-language'], 'js');
    assert.deepEqual(blocks('~~~\n没有关闭\n**仍是代码**')[0],
      { type: 'codeBlock', language: '', text: '没有关闭\n**仍是代码**' });
  });

  test('inline links allow balanced parentheses, emphasis labels and optional titles', () => {
    const parsed = paragraph('[**官网**](https://example.com/说明_(新版)?a=1&b=2 "标题") 和 [返回](../help#faq)');
    assert.deepEqual(parsed[0], { type: 'link', href: 'https://example.com/说明_(新版)?a=1&b=2', title: '标题',
      children: [{ type: 'strong', children: [{ type: 'text', text: '官网' }] }] });
    const links = elements(render('[官网](https://example.com) [邮件](mailto:a@example.com) [返回](#top)'))
      .filter((v) => v.type === 'a');
    assert.equal(links[0].props.target, '_blank');
    assert.equal(links[0].props.rel, 'noopener noreferrer');
    assert.equal(links[1].props.target, undefined);
    assert.equal(links[2].props.href, '#top');
  });

  test('reference links, tables and images remain visible text without image requests', () => {
    for (const source of ['![图](https://example.com/a.png)', '![图](javascript:alert(1))', '![图][ref]', '![](x)',
      '![**图**](https://example.com/a.png)', '![未闭合图', '![未闭合图\n下一行', '![图](**未闭合目标**', '![图][**未闭合引用**',
      '[参考][ref]', '[**参考**][ref]', '[**参考**][未闭合', '| 一 | 二 |\n| --- | --- |']) {
      const output = render(source);
      assert.equal(textOf(output), source.replace(/\n/g, ''), source);
      assert.ok(!elements(output).some((v) => ['a', 'img', 'table'].includes(v.type)), source);
      assert.equal(elements(output).filter((v) => v.type === 'br').length, source.split('\n').length - 1);
    }
  });

  test('malformed punctuation stays readable and cannot form nested anchors', () => {
    for (const source of ['[未关闭', '[文字](未关闭', '`未关闭', '普通 ](文字)', '\\', '<未关闭HTML']) {
      assert.equal(textOf(render(source)), source, source);
    }
    const output = render('[外层 [内层](https://inner.example)](https://outer.example)');
    assert.equal(elements(output).filter((v) => v.type === 'a').length, 1);
    assert.match(textOf(output), /\[内层\]\(https:\/\/inner\.example\)/);
  });
});

describe('announcement Markdown safety and bounds', () => {
  test('only expected protocols or site-relative destinations are accepted', () => {
    for (const href of ['https://example.com', 'HTTP://example.com/中文', 'https://example.com/a%20b?q=a%26b',
      'mailto:a@example.com?subject=%E5%85%AC%E5%91%8A', '/help', './help', '../help', 'help/page?a=1&b=2', '?page=2', '#top']) {
      assert.equal(safeAnnouncementHref(href), href, href);
    }
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<svg>',
      'file:///C:/Windows', 'blob:https://example.com/id', '//other.example/path', '\\other.example',
      'http:example.com', 'https:///example.com', 'mailto:', 'https://user:pass@example.com',
      'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)', '\u0000javascript:alert(1)',
      '&#106;avascript:alert(1)', 'java&#x09;script:alert(1)', 'javascript&colon;alert(1)',
      '%6aavascript%3aalert(1)', 'javascript%3aalert(1)', '%76%62script:msgbox(1)', '%', 'https://example.com/<svg>']) {
      assert.equal(safeAnnouncementHref(href), null, JSON.stringify(href));
    }
    assert.equal(safeAnnouncementHref(null), null);
  });

  test('rejected links keep all their source text without any clickable element', () => {
    for (const destination of ['javascript:alert(1)', 'DATA:text/html,<script>', 'java\tscript:alert(1)',
      'javascript&colon;alert(1)', '&#106;avascript:alert(1)', '%6aavascript%3aalert(1)', '//evil.example']) {
      const source = `[点击](${destination})`, output = render(source);
      assert.equal(textOf(output), source);
      assert.ok(!elements(output).some((v) => v.type === 'a'), source);
    }
  });

  test('raw HTML and attribute-injection attempts stay ordinary text', () => {
    const source = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<svg onload=alert(1)>\n' +
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>\n' +
      '[坏链接](https://example.com/" onmouseover="alert(1))';
    const output = render(source), nodes = elements(output);
    assert.equal(textOf(output), source.replace(/\n/g, ''));
    assert.ok(nodes.every((v) => ['div', 'p', 'br'].includes(v.type)));
    for (const node of nodes) {
      assert.ok(!('dangerouslySetInnerHTML' in node.props));
      assert.ok(Object.keys(node.props).every((key) => !/^on/i.test(key)), node.type);
    }
    // Quotes and ampersands are a single href value, never concatenated into HTML markup.
    const href = 'https://example.com/"quoted"?a=1&b=2';
    const link = elements(render(`[安全](${href})`)).find((v) => v.type === 'a');
    assert.equal(link.props.href, href);
    assert.equal(link.props.onmouseover, undefined);
  });

  test('Markdown within HTML elements remains literal, including multiline and unclosed elements', () => {
    for (const source of ['<b>**文字**</b>', '<b><i>*嵌套*</i></b>', '<script>\n[点击](https://example.com)\n</script>',
      '<b>**未闭合元素**', '<svg onload="alert(1)">[链接](javascript:alert(1))</svg>']) {
      const output = render(source);
      assert.equal(textOf(output), source.replace(/\n/g, ''), source);
      assert.ok(elements(output).every((v) => ['div', 'p', 'br'].includes(v.type)), source);
    }
    assert.equal(elements(render('<b>**原文**</b> 与 *外部 Markdown*')).filter((v) => v.type === 'em').length, 1);
  });

  test('language metadata is bounded and cannot create arbitrary element attributes', () => {
    const node = elements(render('```js" onclick="bad\n内容\n```')).find((v) => v.type === 'code');
    assert.equal(node.props['data-language'], undefined);
    assert.equal(textOf(node), '内容');
    assert.equal(Object.keys(node.props).filter((key) => /^on/i.test(key)).length, 0);
  });

  test('empty and invalid source values do not coerce user-controlled objects', () => {
    for (const source of ['', ' \n\n', null, undefined, 42, { toString() { throw new Error('must not execute'); } }]) {
      assert.deepEqual(parseAnnouncementMarkdown(source), { blocks: [], truncated: false });
      assert.equal(textOf(render(source)), '');
    }
  });

  test('oversized text has an explicit notice and never splits an emoji', () => {
    const limit = ANNOUNCEMENT_MARKDOWN_LIMITS.chars;
    const source = 'a'.repeat(limit - 1) + '😀' + '后文';
    const result = parseAnnouncementMarkdown(source);
    assert.equal(result.truncated, true);
    assert.equal(result.blocks[0].children[0].text, 'a'.repeat(limit - 1));
    const output = render(source);
    assert.equal(elements(output).filter((v) => v.props.class === 'announcement-markdown__notice').length, 1);
    assert.match(textOf(output), /已截断显示/);
    assert.equal(parseAnnouncementMarkdown('a'.repeat(limit)).truncated, false);
  });

  test('a large number of formatted nodes is capped and does not produce an unbounded DOM tree', () => {
    const source = '*x* '.repeat(12000), output = render(source);
    assert.equal(parseAnnouncementMarkdown(source).truncated, true);
    assert.ok(elements(output).length <= ANNOUNCEMENT_MARKDOWN_LIMITS.nodes + ANNOUNCEMENT_MARKDOWN_LIMITS.depth + 2);
    assert.match(textOf(output), /已截断显示/);
  });

  test('unmatched punctuation and deeply nested blocks remain bounded without losing literal text', () => {
    for (const marker of ['[', '`', '(', '*']) {
      const source = '文本 ' + marker.repeat(ANNOUNCEMENT_MARKDOWN_LIMITS.chars - 3);
      assert.equal(textOf(render(source)), source, marker);
    }
    const incompleteTag = '文本 <a-' + 'a-'.repeat(20000);
    assert.equal(textOf(render(incompleteTag)), incompleteTag);
    const quote = '> '.repeat(10000) + '深层文本';
    const output = render(quote);
    assert.equal(elements(output).filter((v) => v.type === 'blockquote').length, ANNOUNCEMENT_MARKDOWN_LIMITS.depth);
    assert.ok(textOf(output).endsWith('深层文本'));
    assert.ok(textOf(output).startsWith('> '));
  });
});
