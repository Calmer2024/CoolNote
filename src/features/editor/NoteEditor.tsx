import { Extension } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { Mathematics } from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import "katex/dist/katex.min.css";

import { Icon } from "../../shared/components/Icon";
import { FloatingLayer } from "../../shared/components/Overlay";
import { fetchWebMetadata, openExternalResource } from "../../shared/tauri/commands";
import type {
  AttachmentDto,
  NoteDto,
  VersionedDocument,
} from "../../shared/tauri/contracts";
import {
  SUPPORTED_TOP_LEVEL_NODES,
  normalizeDocument,
  toTiptapDocument,
} from "./document";
import { linkActivationFromPointerEvent, shouldAutoLink } from "./linkPolicy";
import { noteToMarkdown } from "../export/export";
import {
  PhycatCodeBlock,
  phycatCodeLanguages,
  phycatLanguageIcon,
} from "./phycatCode";
import { MarkdownSyntaxNormalizer } from "./markdownShortcuts";
import { applyHeadingShortcut } from "./editorShortcuts";
import { MermaidNode } from "./mermaidNode";
import { HighlightBlock } from "./highlightBlock";
import { findWebCardPosition } from "./webResource";
import {
  galleryGroupForDrop,
  imageDropIntent,
  imageLayoutRuns,
} from "./imageLayout";
import { fitTextareaHeight, useTextareaAutoHeight } from "./editorSizing";
import { MediaNode, ResizableImage } from "./attachmentNodes";
import {
  attachmentReference,
  mapWithConcurrency,
} from "./attachmentResources";
import { registerOutlineNavigator } from "../outline/Outline";

export type EditorChange = {
  title: string;
  documentJson: VersionedDocument;
  markdownSnapshot: string;
};
export type NoteEditorHandle = {
  flushPendingChanges: () => Promise<void>;
  focusBlock: (blockId: string) => HTMLElement | null;
};
export const StableBlockIds = Extension.create({
  name: "stableBlockIds",
  addGlobalAttributes() {
    return [
      {
        types: [...SUPPORTED_TOP_LEVEL_NODES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) =>
              attributes.blockId
                ? { "data-block-id": attributes.blockId, tabindex: "-1" }
                : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          const changed = transactions.filter((item) => item.docChanged);
          if (!changed.length) return null;
          const changesTopLevelStructure =
            _oldState.doc.childCount !== state.doc.childCount ||
            changed.some((source) =>
            source.steps.some((step) => {
              const json = step.toJSON() as {
                slice?: { content?: Array<{ type?: string }> };
              };
              return json.slice?.content?.some((node) =>
                SUPPORTED_TOP_LEVEL_NODES.has(node.type ?? ""),
              );
            }));
          if (!changesTopLevelStructure) return null;
          const transaction = state.tr;
          const seen = new Set<string>();
          let assigned = false;
          state.doc.forEach((node, position) => {
            if (
              SUPPORTED_TOP_LEVEL_NODES.has(node.type.name) &&
              (!node.attrs.blockId || seen.has(node.attrs.blockId))
            ) {
              const blockId = crypto.randomUUID();
              transaction.setNodeMarkup(position, undefined, {
                ...node.attrs,
                blockId,
              });
              seen.add(blockId);
              assigned = true;
            } else if (node.attrs.blockId) seen.add(node.attrs.blockId);
          });
          return assigned ? transaction : null;
        },
      }),
    ];
  },
});
const ImageGalleryLayout = Extension.create({
  name: "imageGalleryLayout",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          const images: Array<{ node: any; pos: number }> = [];
          state.doc.forEach((node, pos) => images.push({ node, pos }));
          const runs = imageLayoutRuns(
            images.map(({ node }) => ({
              type: node.type.name,
              galleryGroup: node.attrs.galleryGroup,
            })),
          );
          const transaction = state.tr;
          let changed = false;
          for (const indexes of runs)
            for (let offset = 0; offset < indexes.length; offset += 5) {
              const chunk = indexes
                .slice(offset, offset + 5)
                .map((index) => images[index]);
              const gallery = chunk.length > 1;
              chunk.forEach(({ node, pos }, index) => {
                const attrs = {
                  ...node.attrs,
                  layout: gallery ? "gallery" : "single",
                  galleryIndex: gallery ? index : 0,
                  gallerySize: gallery ? chunk.length : 1,
                  width: gallery ? null : node.attrs.width,
                };
                if (
                  node.attrs.layout !== attrs.layout ||
                  node.attrs.galleryIndex !== attrs.galleryIndex ||
                  node.attrs.gallerySize !== attrs.gallerySize ||
                  (gallery && node.attrs.width !== null)
                ) {
                  transaction.setNodeMarkup(pos, undefined, attrs);
                  changed = true;
                }
              });
            }
          return changed ? transaction : null;
        },
      }),
    ];
  },
});
type Props = {
  note: NoteDto;
  focusTitle?: boolean;
  onChange: (change: EditorChange) => void;
  onMoodChange: (mood: string | null) => void;
  onAddAttachment: (file: File) => Promise<AttachmentDto>;
};
type Point = { left: number; top: number };
type SlashState = Point & { query: string };
type InputLayer = {
  kind: "link" | "inlineMath" | "blockMath" | "webResource";
  value: string;
  point?: Point;
  anchor?: HTMLElement;
} | null;
function CodeLanguageIcon({ language }: { language: string }) {
  const icon = phycatLanguageIcon(language);
  return icon ? (
    <span
      className={`code-language-icon ty-file-icon ty-fi-${icon.name}`}
      aria-hidden="true"
    >
      {Array.from({ length: icon.layers }, (_, index) => (
        <span className={`path${index + 1}`} key={index} />
      ))}
    </span>
  ) : null;
}
type FindPanel = {
  replace: boolean;
  query: string;
  replacement: string;
  index: number;
} | null;
type TextMatch = { from: number; to: number };
type SlashItem = {
  id: string;
  section: "基础块" | "媒体与高级内容";
  name: string;
  copy: string;
  icon?: string;
  badge?: string;
  keywords?: string;
  pinyin?: string;
  run?: (editor: any) => void;
};
type PasteProgress = {
  processed: number;
  total: number;
  status: "running" | "failed";
} | null;
type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };
const scheduleIdle = (callback: () => void) => {
  const host = window as IdleWindow;
  return host.requestIdleCallback
    ? {
        kind: "idle" as const,
        id: host.requestIdleCallback(callback, { timeout: 500 }),
      }
    : { kind: "timer" as const, id: window.setTimeout(callback, 0) };
};
const cancelIdle = (task: { kind: "idle" | "timer"; id: number } | null) => {
  if (!task) return;
  const host = window as IdleWindow;
  if (task.kind === "idle") host.cancelIdleCallback?.(task.id);
  else window.clearTimeout(task.id);
};
const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
const moods = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😊",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😌",
  "😎",
  "🤔",
  "🫡",
  "🤗",
  "🥳",
  "😴",
  "🥱",
  "😢",
  "😭",
  "🥺",
  "😤",
  "😡",
  "🤯",
  "😇",
  "🙃",
  "🌿",
  "☕",
  "✨",
  "🌈",
  "💪",
];
const updatedTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return "今天修改";
  if (days === 1) return "昨天修改";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日修改`;
};

const leaveList = (editor: any, chain: any) =>
  editor.isActive("taskList")
    ? chain.toggleTaskList()
    : editor.isActive("bulletList")
      ? chain.toggleBulletList()
      : editor.isActive("orderedList")
        ? chain.toggleOrderedList()
        : chain;
const setTextBlock = (
  editor: any,
  kind: "paragraph" | "heading" | "blockquote" | "codeBlock",
  level?: number,
) => {
  let chain = leaveList(editor, editor.chain().focus());
  if (editor.isActive("blockquote") && kind !== "blockquote")
    chain = chain.toggleBlockquote();
  if (editor.isActive("codeBlock") && kind !== "codeBlock")
    chain = chain.toggleCodeBlock();
  if (kind === "paragraph") chain.setParagraph().run();
  else if (kind === "heading") chain.setHeading({ level }).run();
  else if (kind === "blockquote" && !editor.isActive("blockquote"))
    chain.toggleBlockquote().run();
  else if (kind === "codeBlock" && !editor.isActive("codeBlock"))
    chain.toggleCodeBlock().run();
  else chain.run();
};
const slashItems: SlashItem[] = [
  {
    id: "paragraph",
    section: "基础块",
    name: "正文",
    copy: "普通文本段落",
    icon: "file-text",
    keywords: "文本 paragraph",
    pinyin: "zhengwen zw",
    run: (e) => setTextBlock(e, "paragraph"),
  },
  ...([1, 2, 3, 4, 5] as const).map((level) => ({
    id: `heading-${level}`,
    section: "基础块" as const,
    name: `${["一", "二", "三", "四", "五"][level - 1]}级标题`,
    copy: level < 3 ? "章节标题" : "层级标题",
    keywords: `标题 h${level}`,
    pinyin: `biaoti bt ${["yi", "er", "san", "si", "wu"][level - 1]}ji`,
    badge: `H${level}`,
    run: (e: any) => setTextBlock(e, "heading", level),
  })),
  {
    id: "bullet-list",
    section: "基础块",
    name: "无序列表",
    copy: "项目符号列表",
    icon: "list",
    keywords: "列表 bullet",
    pinyin: "wuxuliebiao wxlb",
    run: (e) => {
      if (!e.isActive("bulletList")) e.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "ordered-list",
    section: "基础块",
    name: "有序列表",
    copy: "数字编号列表",
    icon: "list-ordered",
    keywords: "列表 ordered",
    pinyin: "youxuliebiao yxlb",
    run: (e) => {
      if (!e.isActive("orderedList"))
        e.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "task-list",
    section: "基础块",
    name: "任务列表",
    copy: "可勾选任务",
    icon: "check-square",
    keywords: "任务 todo checklist",
    pinyin: "renwuliebiao rwlb",
    run: (e) => {
      if (!e.isActive("taskList")) e.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "blockquote",
    section: "基础块",
    name: "引用",
    copy: "引用或强调内容",
    icon: "quote",
    keywords: "quote",
    pinyin: "yinyong yy",
    run: (e) => setTextBlock(e, "blockquote"),
  },
  {
    id: "code-block",
    section: "基础块",
    name: "代码块",
    copy: "支持热门语言语法高亮",
    icon: "code",
    keywords: "代码 code js ts python java rust go",
    pinyin: "daimakuai dmk",
    run: (e) => setTextBlock(e, "codeBlock"),
  },
  {
    id: "highlight-block",
    section: "基础块",
    name: "高亮块",
    copy: "带 Emoji 的醒目提示内容",
    icon: "message-square-warning",
    keywords: "高亮 callout highlight emoji",
    pinyin: "gaoliangkuai glk",
  },
  {
    id: "attachment",
    section: "媒体与高级内容",
    name: "图片或附件",
    copy: "多选图片自动生成并排画廊",
    icon: "paperclip",
    keywords: "图片 image file",
    pinyin: "tupian fujian tpfj",
  },
  {
    id: "web-resource",
    section: "媒体与高级内容",
    name: "网址卡片",
    copy: "主动添加带网站 Logo 和摘要的链接卡片",
    icon: "monitor",
    keywords: "网页 网站 website url card",
    pinyin: "wangzhikapian wzkp",
  },
  {
    id: "table",
    section: "媒体与高级内容",
    name: "表格",
    copy: "3 × 3 数据表格",
    icon: "table",
    keywords: "table 表",
    pinyin: "biaoge bg",
  },
  {
    id: "math",
    section: "媒体与高级内容",
    name: "数学公式",
    copy: "支持 $ 行内与 $$ 块公式",
    icon: "code",
    keywords: "公式 math latex",
    pinyin: "shuxuegongshi sxgs",
  },
  {
    id: "mermaid",
    section: "媒体与高级内容",
    name: "文本绘图",
    copy: "流程图、时序图与结构图",
    icon: "list-tree",
    keywords: "Mermaid 流程图 diagram 文本绘图",
    pinyin: "liuchengtu shixutu jiegoutu lct",
  },
];
const textMatches = (editor: any, query: string): TextMatch[] => {
  if (!query) return [];
  const matches: TextMatch[] = [];
  const needle = query.toLocaleLowerCase();
  editor.state.doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const value = String(node.text ?? "").toLocaleLowerCase();
    let offset = 0;
    while ((offset = value.indexOf(needle, offset)) >= 0) {
      matches.push({ from: pos + offset, to: pos + offset + query.length });
      offset += Math.max(1, query.length);
    }
  });
  return matches;
};

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(
  function NoteEditor(
    { note, focusTitle = false, onChange, onMoodChange, onAddAttachment },
    ref,
  ) {
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const slashRef = useRef<HTMLDivElement>(null);
    const findRef = useRef<HTMLInputElement>(null);
    const codeLanguageInputRef = useRef<HTMLInputElement>(null);
    const editorSurfaceRef = useRef<HTMLDivElement>(null);
    const activeCodeBlockRef = useRef("");
    const normalizedDocument = useMemo(
      () => normalizeDocument(note.document),
      [note.id],
    );
    const latestTitle = useRef(note.title);
    const latestDocument = useRef(normalizedDocument);
    const onChangeRef = useRef(onChange);
    const pendingDocRef = useRef<any>(null);
    const dirtyRef = useRef(false);
    const serializationTaskRef = useRef<{
      kind: "idle" | "timer";
      id: number;
    } | null>(null);
    const serializationDebounceRef = useRef<number | null>(null);
    const layerFrameRef = useRef<number | null>(null);
    const pasteAbortRef = useRef(false);
    const [localTitle, setLocalTitle] = useState(note.title);
    const [selection, setSelection] = useState<Point | null>(null);
    const [slash, setSlash] = useState<SlashState | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [tableControl, setTableControl] = useState<Point | null>(null);
    const [codeControl, setCodeControl] = useState<
      (Point & { language: string; blockId: string }) | null
    >(null);
    const [codeLanguageQuery, setCodeLanguageQuery] = useState("");
    const [codeSuggestionsOpen, setCodeSuggestionsOpen] = useState(false);
    const [codeLanguageIndex, setCodeLanguageIndex] = useState(0);
    const [findPanel, setFindPanel] = useState<FindPanel>(null);
    const [moodOpen, setMoodOpen] = useState(false);
    const [inputLayer, setInputLayer] = useState<InputLayer>(null);
    const [pasteProgress, setPasteProgress] = useState<PasteProgress>(null);
    const moodRef = useRef<HTMLButtonElement>(null);
    const filteredSlashItems = useMemo(() => {
      const query = (slash?.query ?? "").trim().toLowerCase();
      return query
        ? slashItems.filter((item) =>
            `${item.name} ${item.copy} ${item.keywords ?? ""} ${item.pinyin ?? ""}`
              .toLowerCase()
              .includes(query),
          )
        : slashItems;
    }, [slash?.query]);
    const filteredCodeLanguages = useMemo(() => {
      const query = codeLanguageQuery.trim().toLowerCase();
      return query
        ? phycatCodeLanguages.filter((language) =>
            (language || "auto").includes(query),
          )
        : phycatCodeLanguages;
    }, [codeLanguageQuery]);
    const codeLayerPoint = (box: DOMRect): Point | null => {
      const bounds = editorSurfaceRef.current?.getBoundingClientRect();
      if (
        !bounds ||
        box.bottom < bounds.top ||
        box.bottom > bounds.bottom ||
        box.right < bounds.left ||
        box.left > bounds.right
      )
        return null;
      return {
        left: Math.max(
          bounds.left,
          Math.min(box.right - 160, bounds.right - 160),
        ),
        top: box.bottom,
      };
    };
    const updateLayers = (current: any) => {
      const { from, to, $from } = current.state.selection;
      try {
        const start = current.view.coordsAtPos(from);
        const inCode = $from.parent.type.name === "codeBlock";
        if (from !== to && !current.state.selection.node && !inCode) {
          const end = current.view.coordsAtPos(to);
          setSelection({
            left: start.left,
            top: Math.min(start.top, end.top) - 8,
          });
        } else setSelection(null);
        const before =
          $from.parent.type.name === "paragraph"
            ? $from.parent.textBetween(0, $from.parentOffset, "\n", "\0")
            : "";
        const slashMatch = from === to ? before.match(/^\/(.*)$/) : null;
        if (slashMatch) {
          const origin = current.view.coordsAtPos($from.start());
          setSlash({
            left: origin.left,
            top: start.bottom + 6,
            query: slashMatch[1],
          });
          setSlashIndex(0);
        } else setSlash(null);
        const domAt = current.view.domAtPos(from).node;
        const element = domAt instanceof Element ? domAt : domAt.parentElement;
        const cell = element?.closest("td,th");
        if (cell) {
          const box = cell.getBoundingClientRect();
          setTableControl({ left: box.left, top: box.top });
        } else setTableControl(null);
        const topNode =
          $from.depth >= 1 ? $from.node(1) : current.state.selection.node;
        const topStart = $from.depth >= 1 ? $from.before(1) : from;
        const topDom = current.view.nodeDOM(topStart);
        const box =
          topDom instanceof HTMLElement ? topDom.getBoundingClientRect() : null;
        const point = box ? codeLayerPoint(box) : null;
        if (topNode?.type.name === "codeBlock" && box && point) {
          const language = topNode.attrs.language ?? "";
          const blockId = topNode.attrs.blockId ?? "";
          if (activeCodeBlockRef.current !== blockId) {
            activeCodeBlockRef.current = blockId;
            setCodeLanguageQuery(language);
            setCodeSuggestionsOpen(false);
            setCodeLanguageIndex(0);
          }
          setCodeControl({ ...point, language, blockId });
        } else {
          activeCodeBlockRef.current = "";
          setCodeControl(null);
          setCodeLanguageQuery("");
          setCodeSuggestionsOpen(false);
        }
      } catch {
        activeCodeBlockRef.current = "";
        setSelection(null);
        setSlash(null);
        setTableControl(null);
        setCodeControl(null);
        setCodeLanguageQuery("");
        setCodeSuggestionsOpen(false);
      }
    };
    const serializePending = useCallback(() => {
      if (serializationDebounceRef.current !== null)
        window.clearTimeout(serializationDebounceRef.current);
      serializationDebounceRef.current = null;
      cancelIdle(serializationTaskRef.current);
      serializationTaskRef.current = null;
      if (!dirtyRef.current) return;
      const doc = pendingDocRef.current;
      if (doc) {
        pendingDocRef.current = null;
        const next = normalizeDocument({
          schemaVersion: 1,
          type: "doc",
          content: doc.toJSON().content ?? [],
        });
        latestDocument.current = next;
      }
      dirtyRef.current = false;
      onChangeRef.current({
        title: latestTitle.current,
        documentJson: latestDocument.current,
        markdownSnapshot: noteToMarkdown(
          latestTitle.current,
          latestDocument.current,
        ),
      });
    }, []);
    const scheduleSerialization = useCallback(
      (doc?: any) => {
        if (doc) pendingDocRef.current = doc;
        if (serializationDebounceRef.current !== null)
          window.clearTimeout(serializationDebounceRef.current);
        serializationDebounceRef.current = window.setTimeout(() => {
          serializationDebounceRef.current = null;
          if (!serializationTaskRef.current)
            serializationTaskRef.current = scheduleIdle(serializePending);
        }, 250);
      },
      [serializePending],
    );
    const scheduleLayerUpdate = (current: any) => {
      if (layerFrameRef.current !== null) return;
      layerFrameRef.current = window.requestAnimationFrame(() => {
        layerFrameRef.current = null;
        updateLayers(current);
      });
    };
    const beginLargePaste = (view: any, text: string) => {
      const lines = text.replace(/\r\n?/g, "\n").split("\n");
      const originalDoc = view.state.doc;
      const originalSelection = {
        from: view.state.selection.from,
        to: view.state.selection.to,
      };
      pasteAbortRef.current = false;
      setPasteProgress({
        processed: 0,
        total: lines.length,
        status: "running",
      });
      view.dom.setAttribute("aria-busy", "true");
      view.setProps({ ...view.props, editable: () => false });
      void (async () => {
        try {
          let position = view.state.selection.from;
          let first = true;
          for (let offset = 0; offset < lines.length; offset += 75) {
            if (pasteAbortRef.current) throw new Error("cancelled");
            const values = lines.slice(offset, offset + 75);
            const nodes = values.map((line) =>
              view.state.schema.nodes.paragraph.create(
                { blockId: crypto.randomUUID() },
                line ? view.state.schema.text(line) : undefined,
              ),
            );
            let transaction = view.state.tr;
            if (first) {
              transaction = transaction.deleteSelection();
              position = transaction.selection.from;
              first = false;
            }
            transaction = transaction.insert(position, nodes);
            position += nodes.reduce(
              (sum: any, node: any) => sum + node.nodeSize,
              0,
            );
            view.dispatch(transaction);
            setPasteProgress({
              processed: Math.min(offset + values.length, lines.length),
              total: lines.length,
              status: "running",
            });
            await nextFrame();
          }
          setPasteProgress(null);
          view.focus();
        } catch (cause) {
          let transaction = view.state.tr.replaceWith(
            0,
            view.state.doc.content.size,
            originalDoc.content,
          );
          const from = Math.min(
            originalSelection.from,
            transaction.doc.content.size,
          );
          const to = Math.min(
            originalSelection.to,
            transaction.doc.content.size,
          );
          transaction = transaction.setSelection(
            TextSelection.create(transaction.doc, from, to),
          );
          view.dispatch(transaction);
          if (cause instanceof Error && cause.message === "cancelled")
            setPasteProgress(null);
          else
            setPasteProgress({
              processed: 0,
              total: lines.length,
              status: "failed",
            });
        } finally {
          view.setProps({ ...view.props, editable: () => true });
          view.dom.removeAttribute("aria-busy");
        }
      })();
    };
    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5] },
          link: false,
          underline: false,
          codeBlock: false,
        }),
        PhycatCodeBlock,
        Underline,
        Highlight.configure({ multicolor: false }),
        Link.configure({
          openOnClick: false,
          autolink: false,
          defaultProtocol: "https",
          shouldAutoLink,
        }),
        ResizableImage.configure({ allowBase64: true, inline: false }),
        ImageGalleryLayout,
        MediaNode,
        HighlightBlock,
        TableKit.configure({ table: { resizable: true } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Mathematics.configure({ katexOptions: { throwOnError: false } }),
        MarkdownSyntaxNormalizer,
        MermaidNode,
        Placeholder.configure({
          placeholder: "输入 / 唤醒菜单",
          showOnlyCurrent: true,
        }),
        StableBlockIds,
      ],
      content: toTiptapDocument(normalizedDocument),
      editorProps: {
        attributes: {
          class: "note-editor-content",
          role: "textbox",
          "aria-label": "笔记正文",
          "aria-multiline": "true",
        },
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (files.length) {
            event.preventDefault();
            void addFiles(files, view.state.selection.from);
            return true;
          }
          const text = event.clipboardData?.getData("text/plain") ?? "";
          const lines = (text.match(/\n/g)?.length ?? 0) + 1;
          if (text.length < 50_000 && lines < 500) return false;
          event.preventDefault();
          beginLargePaste(view, text);
          return true;
        },
        handleDrop: (view, event) => {
          const transfer = event.dataTransfer;
          const files = Array.from(transfer?.files ?? []);
          const point = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          const targetElement = (
            event.target as Element | null
          )?.closest<HTMLElement>(".editor-image");
          const targetNodePos = Number(targetElement?.dataset.nodePos);
          const targetNode = Number.isFinite(targetNodePos)
            ? view.state.doc.nodeAt(targetNodePos)
            : null;
          const targetSide =
            targetElement?.dataset.dropSide === "left" ||
            targetElement?.dataset.dropSide === "right"
              ? targetElement.dataset.dropSide
              : null;
          const sourceValue =
            transfer?.getData("application/x-coolnote-image-pos") ?? "";
          const sourcePosition =
            sourceValue === "" ? Number.NaN : Number(sourceValue);
          if (Number.isFinite(sourcePosition)) {
            const sourceNode = view.state.doc.nodeAt(sourcePosition);
            if (sourceNode?.type.name === "image") {
              event.preventDefault();
              if (sourcePosition === targetNodePos) return true;
              const sourceDom = view.nodeDOM(sourcePosition);
              const dropPlacement = imageDropIntent({
                sourceTop:
                  sourceDom instanceof HTMLElement
                    ? sourceDom.getBoundingClientRect().top
                    : event.clientY,
                targetTop: targetElement?.getBoundingClientRect().top ?? null,
                targetSide,
              });
              const insertAfterTarget =
                dropPlacement === "right" || dropPlacement === "merge";
              const targetPosition = Number.isFinite(targetNodePos)
                ? targetNodePos +
                  (insertAfterTarget ? (targetNode?.nodeSize ?? 0) : 0)
                : (point?.pos ?? view.state.selection.from);
              const nextGalleryGroup = galleryGroupForDrop(
                sourceNode.attrs.galleryGroup,
                targetNode?.type.name === "image"
                  ? targetNode.attrs.galleryGroup
                  : null,
                dropPlacement,
                () => crypto.randomUUID(),
              );
              const movedNode = sourceNode.type.create(
                { ...sourceNode.attrs, galleryGroup: nextGalleryGroup },
                sourceNode.content,
                sourceNode.marks,
              );
              let insertAt = targetPosition;
              const transaction = view.state.tr.delete(
                sourcePosition,
                sourcePosition + sourceNode.nodeSize,
              );
              if (
                insertAfterTarget &&
                targetNode?.type.name === "image" &&
                !targetNode.attrs.galleryGroup
              ) {
                const mappedTarget = transaction.mapping.map(targetNodePos);
                transaction.setNodeMarkup(mappedTarget, undefined, {
                  ...targetNode.attrs,
                  galleryGroup: nextGalleryGroup,
                });
              }
              if (insertAt > sourcePosition) insertAt -= sourceNode.nodeSize;
              insertAt = Math.max(
                0,
                Math.min(insertAt, transaction.doc.content.size),
              );
              transaction.insert(insertAt, movedNode);
              view.dispatch(transaction.scrollIntoView());
              return true;
            }
          }
          if (!files.length) return false;
          event.preventDefault();
          const targetPosition = Number.isFinite(targetNodePos)
            ? targetNodePos +
              (targetSide === "right" ? (targetNode?.nodeSize ?? 0) : 0)
            : (point?.pos ?? view.state.selection.from);
          let targetGalleryGroup: string | undefined;
          if (targetSide === "right" && targetNode?.type.name === "image") {
            targetGalleryGroup =
              targetNode.attrs.galleryGroup ?? crypto.randomUUID();
            if (!targetNode.attrs.galleryGroup) {
              view.dispatch(
                view.state.tr.setNodeMarkup(targetNodePos, undefined, {
                  ...targetNode.attrs,
                  galleryGroup: targetGalleryGroup,
                }),
              );
            }
          }
          void addFiles(files, targetPosition, targetGalleryGroup);
          return true;
        },
        handleClick: (_view, _pos, event) => {
          const anchor = (
            event.target as Element | null
          )?.closest<HTMLAnchorElement>("a[href]");
          if (!anchor) return false;
          const activation = linkActivationFromPointerEvent({
            href: anchor.getAttribute("href"),
            button: event.button,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
          });
          if (!activation) return false;
          event.preventDefault();
          event.stopPropagation();
          void openExternalResource(activation.url);
          return true;
        },
        handleKeyDown: (view, event) => {
          if (
            event.key === "/" &&
            view.state.selection.empty &&
            view.state.selection.$from.parent.type.name === "paragraph" &&
            view.state.selection.$from.parent.textContent === ""
          )
            window.setTimeout(() => {
              const point = view.coordsAtPos(view.state.selection.from);
              setSlash({ left: point.left, top: point.bottom + 6, query: "" });
              setSlashIndex(0);
            }, 0);
          return false;
        },
      },
      onSelectionUpdate: ({ editor: current }) => scheduleLayerUpdate(current),
      onFocus: ({ editor: current }) => scheduleLayerUpdate(current),
      onBlur: () => window.setTimeout(() => setSelection(null), 120),
      onUpdate: ({ editor: current }) => {
        dirtyRef.current = true;
        scheduleSerialization(current.state.doc);
      },
    });

    useTextareaAutoHeight(titleRef, localTitle, note.id, !!editor);

    useImperativeHandle(
      ref,
      () => ({
        flushPendingChanges: async () => serializePending(),
        focusBlock: (blockId: string) => {
          if (!editor) return null;
          let targetPos: number | null = null;
          editor.state.doc.forEach((node: any, pos: number) => {
            if (targetPos === null && node.attrs?.blockId === blockId) targetPos = pos;
          });
          if (targetPos === null) return null;
          const dom = editor.view.nodeDOM(targetPos);
          if (!(dom instanceof HTMLElement)) return null;
          editor.view.focus();
          dom.focus({ preventScroll: true });
          return dom;
        },
      }),
      [serializePending],
    );
    useEffect(() => {
      registerOutlineNavigator((blockId) => {
        if (!editor) return null;
        let targetPos: number | null = null;
        editor.state.doc.forEach((node: any, pos: number) => {
          if (targetPos === null && node.attrs?.blockId === blockId) targetPos = pos;
        });
        if (targetPos === null) return null;
        const dom = editor.view.nodeDOM(targetPos);
        if (!(dom instanceof HTMLElement)) return null;
        editor.view.focus();
        dom.focus({ preventScroll: true });
        return dom;
      });
      return () => registerOutlineNavigator(null);
    }, [editor]);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    useEffect(() => {
      latestTitle.current = note.title;
      setLocalTitle(note.title);
      dirtyRef.current = false;
    }, [note.id]);
    useEffect(() => {
      latestDocument.current = normalizedDocument;
      pendingDocRef.current = null;
      dirtyRef.current = false;
      editor?.commands.setContent(toTiptapDocument(normalizedDocument), {
        emitUpdate: false,
      });
    }, [normalizedDocument, editor, note.id]);
    useEffect(() => {
      if (focusTitle) titleRef.current?.focus();
    }, [focusTitle, note.id]);
    useEffect(
      () => () => {
        if (serializationDebounceRef.current !== null)
          window.clearTimeout(serializationDebounceRef.current);
        cancelIdle(serializationTaskRef.current);
        if (layerFrameRef.current !== null)
          window.cancelAnimationFrame(layerFrameRef.current);
      },
      [],
    );
    useEffect(() => {
      if (!editor) return;
      const reposition = (event?: Event) => {
        if (
          event?.type === "scroll" &&
          event.target instanceof Element &&
          event.target.closest(
            ".slash-menu,.code-language-picker,.code-language-options",
          )
        )
          return;
        if (editor.isFocused || activeCodeBlockRef.current)
          updateLayers(editor);
      };
      const viewport = window.visualViewport;
      const observer = new ResizeObserver(() => reposition());
      observer.observe(editor.view.dom);
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true);
      viewport?.addEventListener("resize", reposition);
      viewport?.addEventListener("scroll", reposition);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", reposition);
        window.removeEventListener("scroll", reposition, true);
        viewport?.removeEventListener("resize", reposition);
        viewport?.removeEventListener("scroll", reposition);
      };
    }, [editor]);
    useEffect(() => {
      if (!editor) return;
      const total = filteredSlashItems.length;
      const handler = (event: KeyboardEvent) => {
        if (!slash) return;
        if (event.key === "ArrowDown" && total) {
          event.preventDefault();
          setSlashIndex((index) => (index + 1) % total);
        }
        if (event.key === "ArrowUp" && total) {
          event.preventDefault();
          setSlashIndex((index) => (index - 1 + total) % total);
        }
        if (event.key === "Enter" && total) {
          event.preventDefault();
          runSlash(filteredSlashItems[Math.min(slashIndex, total - 1)]);
        }
        if (event.key === "Escape") setSlash(null);
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [editor, slash, slashIndex, filteredSlashItems]);
    useEffect(() => {
      if (!editor) return;
      const handler = (event: KeyboardEvent) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        const editing =
          editor.isFocused ||
          editor.view.dom.contains(event.target as globalThis.Node);
        if (!editing) return;
        if (applyHeadingShortcut(editor,event)) return;
        if (key === "i") {
          event.preventDefault();
          editor.chain().focus().toggleItalic().run();
        } else if (key === "u") {
          event.preventDefault();
          editor.chain().focus().toggleUnderline().run();
        } else if (key === "t") {
          event.preventDefault();
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run();
        } else if (key === "f" || key === "h") {
          event.preventDefault();
          setFindPanel((current) => ({
            replace: key === "h",
            query: current?.query ?? "",
            replacement: current?.replacement ?? "",
            index: -1,
          }));
          window.setTimeout(() => findRef.current?.focus(), 0);
        }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [editor]);
    useEffect(() => {
      slashRef.current
        ?.querySelector(".slash-item.active")
        ?.scrollIntoView({ block: "nearest" });
    }, [slashIndex]);
    if (!editor) return null;

    async function addFiles(
      files: File[],
      position?: number,
      galleryGroupOverride?: string,
    ) {
      if (!editor || !files.length) return;
      const galleryGroup = galleryGroupOverride ?? crypto.randomUUID();
      const attachments = await mapWithConcurrency(
        files,
        3,
        (file) => onAddAttachment(file),
      );
      const content = files.map((file, index) =>
        file.type.startsWith("image/")
          ? {
              type: "image",
              attrs: {
                src: attachmentReference(attachments[index].id),
                alt: file.name,
                title: file.name,
                attachmentId: attachments[index].id,
                galleryGroup,
              },
            }
          : {
              type: "media",
              attrs: {
                src: attachmentReference(attachments[index].id),
                mediaType:
                  file.type ||
                  (/\.html?$/i.test(file.name)
                    ? "text/html"
                    : "application/octet-stream"),
                fileName: file.name,
                attachmentId: attachments[index].id,
              },
            },
      );
      const chain = editor.chain().focus();
      if (typeof position === "number")
        chain.insertContentAt(position, content).run();
      else chain.insertContent(content).run();
    }
    function runSlash(item: SlashItem) {
      if (!editor) return;
      const inputPoint = slash
        ? { left: slash.left, top: slash.top }
        : { left: window.innerWidth / 2, top: 120 };
      const { from, $from } = editor.state.selection;
      const anchorNode = $from.depth >= 1
        ? editor.view.nodeDOM($from.before(1))
        : null;
      const inputAnchor = anchorNode instanceof HTMLElement ? anchorNode : undefined;
      editor
        .chain()
        .focus()
        .deleteRange({ from: $from.start(), to: from })
        .run();
      if (item.run) item.run(editor);
      else if (item.id === "highlight-block")
        editor
          .chain()
          .focus()
          .insertContent({
            type: "highlightBlock",
            attrs: { emoji: "💡" },
            content: [{ type: "paragraph" }],
          })
          .run();
      else if (item.id === "attachment") fileRef.current?.click();
      else if (item.id === "web-resource")
        setInputLayer({
          kind: "webResource",
          value: "https://",
          point: inputPoint,
          anchor: inputAnchor,
        });
      else if (item.id === "table")
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      else if (item.id === "math")
        setInputLayer({
          kind: "blockMath",
          value: "\\sum_{i=1}^{n} i",
          point: inputPoint,
          anchor: inputAnchor,
        });
      else if (item.id === "mermaid")
        editor
          .chain()
          .focus()
          .insertContent({
            type: "mermaid",
            attrs: {
              source: "graph TD\n  A[开始] --> B[完成]",
              width: 100,
              focusSource: true,
            },
          })
          .run();
      setSlash(null);
    }
    const applyInput = async () => {
      if (!inputLayer) return;
      const value = inputLayer.value.trim();
      if (!value) {
        setInputLayer(null);
        return;
      }
      if (inputLayer.kind === "link")
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: value })
          .run();
      if (inputLayer.kind === "inlineMath")
        editor.chain().focus().insertInlineMath({ latex: value }).run();
      if (inputLayer.kind === "blockMath")
        editor.chain().focus().insertBlockMath({ latex: value }).run();
      if (inputLayer.kind === "webResource" && /^https?:\/\//i.test(value)) {
        let label = value;
        try {
          label = new URL(value).hostname;
        } catch {}
        const position = editor.state.selection.from;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "media",
            attrs: { src: value, mediaType: "text/uri-list", fileName: label, webTitle: label },
          })
          .run();
        void fetchWebMetadata(value).then(metadata => {
          const cardPosition = findWebCardPosition(editor.state.doc, value, position);
          if (cardPosition === null) return;
          const current = editor.state.doc.nodeAt(cardPosition);
          if (!current) return;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(cardPosition, undefined, {
            ...current.attrs,
            src: metadata.url,
            fileName: metadata.title,
            webTitle: metadata.title,
            webDescription: metadata.description,
            webImageUrl: metadata.imageUrl,
            webIconUrl: metadata.iconUrl,
            webSiteName: metadata.siteName,
            webType: metadata.pageType,
          }));
        }).catch(() => undefined);
      }
      setInputLayer(null);
    };
    const revealMatch = (direction: 1 | -1 = 1) => {
      if (!findPanel?.query) return;
      const matches = textMatches(editor, findPanel.query);
      if (!matches.length) {
        setFindPanel({ ...findPanel, index: -1 });
        return;
      }
      const next =
        findPanel.index < 0
          ? direction === 1
            ? 0
            : matches.length - 1
          : (findPanel.index + direction + matches.length) % matches.length;
      const match = matches[next];
      editor.view.dispatch(
        editor.state.tr
          .setSelection(
            TextSelection.create(editor.state.doc, match.from, match.to),
          )
          .scrollIntoView(),
      );
      setFindPanel({ ...findPanel, index: next });
    };
    const replaceCurrent = () => {
      if (!findPanel?.query) return;
      const matches = textMatches(editor, findPanel.query);
      const index = Math.max(0, Math.min(findPanel.index, matches.length - 1));
      const match = matches[index];
      if (!match) return;
      editor.view.dispatch(
        editor.state.tr.insertText(findPanel.replacement, match.from, match.to),
      );
      setFindPanel({
        ...findPanel,
        index: Math.min(index, Math.max(0, matches.length - 2)),
      });
    };
    const replaceAll = () => {
      if (!findPanel?.query) return;
      const matches = textMatches(editor, findPanel.query);
      let transaction = editor.state.tr;
      for (const match of [...matches].reverse())
        transaction = transaction.insertText(
          findPanel.replacement,
          match.from,
          match.to,
        );
      if (matches.length) editor.view.dispatch(transaction);
      setFindPanel({ ...findPanel, index: 0 });
    };
    const chooseCodeLanguage = (language: string) => {
      if (!codeControl) return;
      const normalized = language.trim().toLowerCase();
      let position: number | null = null;
      let attrs: any = null;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (
          position === null &&
          node.type.name === "codeBlock" &&
          node.attrs.blockId === codeControl.blockId
        ) {
          position = pos;
          attrs = node.attrs;
          return false;
        }
      });
      if (position !== null)
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(position, undefined, {
            ...attrs,
            language: normalized || null,
          }),
        );
      setCodeControl({ ...codeControl, language: normalized });
      setCodeLanguageQuery(normalized);
      setCodeSuggestionsOpen(false);
      setCodeLanguageIndex(0);
    };
    const codeLayerBounds = editorSurfaceRef.current?.getBoundingClientRect();
    const codeSuggestionsAbove =
      !!codeControl &&
      !!codeLayerBounds &&
      codeControl.top +
        Math.min(320, filteredCodeLanguages.length * 34 + 12) +
        32 >
        codeLayerBounds.bottom;
    const codeOptionsMaxHeight =
      codeControl && codeLayerBounds
        ? Math.max(
            40,
            Math.min(
              320,
              codeSuggestionsAbove
                ? codeControl.top - codeLayerBounds.top - 5
                : codeLayerBounds.bottom - codeControl.top - 32,
            ),
          )
        : 320;

    return (
      <div className="document-body">
        <div className="document-heading">
          <textarea
            rows={1}
            ref={titleRef}
            className="document-title-input"
            aria-label="笔记标题"
            value={localTitle}
            placeholder="无标题笔记"
            onChange={(event) => {
              const title = event.currentTarget.value.replace(/\r?\n/g, " ");
              setLocalTitle(title);
              latestTitle.current = title;
              fitTextareaHeight(event.currentTarget);
              dirtyRef.current = true;
              scheduleSerialization();
            }}
          />
          <div className="document-meta" id="documentMeta">
            <button
              ref={moodRef}
              className="mood-trigger"
              aria-label={note.mood ? "更换心情" : "选择心情"}
              aria-expanded={moodOpen}
              onClick={() => setMoodOpen((value) => !value)}
            >
              {note.mood || "🙂"}
            </button>
            <span className="document-meta-separator" aria-hidden="true" />
            <time dateTime={note.updatedAt}>{updatedTime(note.updatedAt)}</time>
          </div>
        </div>
        <FloatingLayer
          open={moodOpen}
          anchor={moodRef}
          placement="bottom-start"
          className="mood-picker product-layer"
          onDismiss={() => setMoodOpen(false)}
        >
          <div className="mood-grid">
            {moods.map((mood) => (
              <button
                key={mood}
                aria-label={`心情 ${mood}`}
                className={note.mood === mood ? "active" : ""}
                onClick={() => {
                  onMoodChange(mood);
                  setMoodOpen(false);
                }}
              >
                {mood}
              </button>
            ))}
            <button
              className="mood-clear"
              onClick={() => {
                onMoodChange(null);
                setMoodOpen(false);
              }}
            >
              清除
            </button>
          </div>
        </FloatingLayer>
        <div
          ref={editorSurfaceRef}
          className="editor-surface"
          onPointerDownCapture={(event) => {
            const target =
              event.target instanceof Element ? event.target : null;
            const block = target?.closest<HTMLElement>("pre.phycat-code");
            if (!block || !event.currentTarget.contains(block)) return;
            const box = block.getBoundingClientRect();
            const point = codeLayerPoint(box);
            if (!point) {
              activeCodeBlockRef.current = "";
              setCodeControl(null);
              return;
            }
            const language = block.dataset.language ?? "";
            const blockId = block.dataset.blockId ?? "";
            if (activeCodeBlockRef.current !== blockId) {
              activeCodeBlockRef.current = blockId;
              setCodeLanguageQuery(language);
              setCodeSuggestionsOpen(false);
              setCodeLanguageIndex(0);
            }
            setSelection(null);
            setCodeControl({ ...point, language, blockId });
          }}
        >
          <EditorContent editor={editor} />
        </div>
        <FloatingLayer
          open={!!selection}
          point={selection ?? undefined}
          placement="top-start"
          gap={8}
          className="selection-toolbar product-layer"
          onDismiss={() => setSelection(null)}
        >
          {selection && (
            <div
              className="selection-toolbar-inner"
              onMouseDown={(event) => event.preventDefault()}
            >
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <button
                  key={level}
                  className={`heading-tool${editor.isActive("heading", { level }) ? " active" : ""}`}
                  aria-label={`${level} 级标题`}
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level }).run()
                  }
                >
                  H{level}
                </button>
              ))}
              <span className="divider" />
              <button
                className={editor.isActive("bold") ? "active" : ""}
                aria-label="粗体"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <strong>B</strong>
              </button>
              <button
                aria-label="斜体"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <i>I</i>
              </button>
              <button
                aria-label="下划线"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <u>U</u>
              </button>
              <button
                aria-label="删除线"
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <s>S</s>
              </button>
              <button aria-label="行内代码" onClick={() => editor.chain().focus().toggleCode().run()}>
                <Icon name="code" />
              </button>
              <button className={editor.isActive("highlight") ? "active highlight-tool" : "highlight-tool"} aria-label="文字高亮" onClick={() => editor.chain().focus().toggleHighlight().run()}><Icon name="palette" /></button>
              <span className="divider" />
              <button
                aria-label="添加链接"
                onClick={() =>
                  setInputLayer({
                    kind: "link",
                    value: editor.getAttributes("link").href ?? "https://",
                    point: selection,
                  })
                }
              >
                <Icon name="link" />
              </button>
            </div>
          )}
        </FloatingLayer>
        <FloatingLayer
          open={!!slash}
          point={slash ?? undefined}
          placement="bottom-start"
          gap={4}
          className="slash-menu product-layer"
          onDismiss={() => setSlash(null)}
        >
          {slash && (
            <div className="slash-menu-scroll">
              <div className="slash-search">
                <Icon name="search" />
                <span>
                  {slash.query
                    ? `搜索：${slash.query}`
                    : "输入关键词筛选，Enter 使用"}
                </span>
              </div>
              <div ref={slashRef} className="slash-menu-items">
                {(["基础块", "媒体与高级内容"] as const).map((section) => {
                  const items = filteredSlashItems.filter(
                    (item) => item.section === section,
                  );
                  return items.length ? (
                    <div className="slash-section" key={section}>
                      <div className="slash-label">{section}</div>
                      {items.map((item) => {
                        const index = filteredSlashItems.indexOf(item);
                        return (
                          <button
                            className={`slash-item${index === slashIndex ? " active" : ""}`}
                            key={item.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setSlashIndex(index)}
                            onClick={() => runSlash(item)}
                          >
                            {item.badge ? (
                              <span className="slash-type-badge">
                                {item.badge}
                              </span>
                            ) : (
                              <Icon name={item.icon ?? "file-text"} />
                            )}
                            <span className="slash-copy">
                              <strong>{item.name}</strong>
                              <small>{item.copy}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null;
                })}
                {!filteredSlashItems.length && (
                  <div className="slash-empty">没有匹配的内容块</div>
                )}
              </div>
            </div>
          )}
        </FloatingLayer>
        <FloatingLayer
          open={!!tableControl}
          point={tableControl ?? undefined}
          placement="top-start"
          gap={8}
          className="table-toolbar product-layer"
          onDismiss={() => setTableControl(null)}
        >
          {tableControl && (
            <div onMouseDown={(event) => event.preventDefault()}>
              <button
                aria-label="向上插入行"
                onClick={() => editor.chain().focus().addRowBefore().run()}
              >
                <Icon name="plus" />
                上方行
              </button>
              <button
                aria-label="向下插入行"
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                <Icon name="plus" />
                下方行
              </button>
              <button
                aria-label="向左插入列"
                onClick={() => editor.chain().focus().addColumnBefore().run()}
              >
                <Icon name="columns-2" />
                左侧列
              </button>
              <button
                aria-label="向右插入列"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                <Icon name="columns-2" />
                右侧列
              </button>
              <span className="divider" />
              <button
                className="danger"
                aria-label="删除当前行"
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                <Icon name="trash-2" />行
              </button>
              <button
                className="danger"
                aria-label="删除当前列"
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                <Icon name="trash-2" />列
              </button>
              <button
                className="danger"
                aria-label="删除表格"
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                <Icon name="trash-2" />
                表格
              </button>
            </div>
          )}
        </FloatingLayer>
        <FloatingLayer
          open={!!codeControl}
          boundary={editorSurfaceRef}
          point={codeControl ?? undefined}
          placement="bottom-start"
          gap={0}
          className={`code-language-picker${codeSuggestionsOpen ? " suggestions-open" : ""}${codeSuggestionsAbove ? " suggestions-above" : ""}`}
          onDismiss={() => {
            activeCodeBlockRef.current = "";
            setCodeControl(null);
            setCodeLanguageQuery("");
            setCodeSuggestionsOpen(false);
          }}
        >
          {codeControl && (
            <div className="code-language-control">
              <input
                ref={codeLanguageInputRef}
                aria-label="搜索代码语言"
                placeholder="代码语言"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                value={codeLanguageQuery}
                onFocus={(event) => {
                  const input = event.currentTarget;
                  setCodeLanguageQuery(codeControl.language);
                  setCodeSuggestionsOpen(true);
                  setCodeLanguageIndex(
                    Math.max(
                      0,
                      phycatCodeLanguages.indexOf(codeControl.language),
                    ),
                  );
                  window.setTimeout(() => input.select(), 0);
                }}
                onChange={(event) => {
                  setCodeLanguageQuery(event.target.value.toLowerCase());
                  setCodeSuggestionsOpen(true);
                  setCodeLanguageIndex(0);
                }}
                onBlur={() =>
                  window.setTimeout(() => {
                    if (
                      !document.activeElement?.closest(".code-language-picker")
                    )
                      chooseCodeLanguage(codeLanguageQuery);
                  }, 0)
                }
                onKeyDown={(event) => {
                  const total = filteredCodeLanguages.length;
                  if (event.key === "ArrowDown" && total) {
                    event.preventDefault();
                    setCodeSuggestionsOpen(true);
                    setCodeLanguageIndex((index) => (index + 1) % total);
                  } else if (event.key === "ArrowUp" && total) {
                    event.preventDefault();
                    setCodeSuggestionsOpen(true);
                    setCodeLanguageIndex(
                      (index) => (index - 1 + total) % total,
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    chooseCodeLanguage(
                      codeSuggestionsOpen && total
                        ? filteredCodeLanguages[
                            Math.min(codeLanguageIndex, total - 1)
                          ]
                        : codeLanguageQuery,
                    );
                    editor.commands.focus();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setCodeLanguageQuery(codeControl.language);
                    setCodeSuggestionsOpen(false);
                    editor.commands.focus();
                  }
                }}
              />
              {codeSuggestionsOpen && (
                <ul
                  className="code-language-options"
                  role="listbox"
                  style={{ maxHeight: codeOptionsMaxHeight }}
                >
                  {filteredCodeLanguages.map((language, index) => (
                    <li key={language || "auto"}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={codeControl.language === language}
                        className={`${index === codeLanguageIndex ? "active " : ""}${codeControl.language === language ? "selected " : ""}${language ? "" : "is-auto"}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setCodeLanguageIndex(index)}
                        onClick={() => {
                          chooseCodeLanguage(language);
                          editor.commands.focus();
                        }}
                      >
                        <CodeLanguageIcon language={language} />
                        <span className="code-language-label">
                          {language || "auto"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </FloatingLayer>
        <FloatingLayer
          open={!!findPanel}
          point={{ left: Math.max(12, window.innerWidth - 520), top: 82 }}
          placement="bottom-start"
          gap={0}
          className="editor-find-bar product-layer"
          onDismiss={() => setFindPanel(null)}
          role="search"
        >
          {findPanel && (
            <>
              <label>
                <Icon name="search" />
                <input
                  ref={findRef}
                  aria-label="查找内容"
                  placeholder="查找"
                  value={findPanel.query}
                  onChange={(event) =>
                    setFindPanel({
                      ...findPanel,
                      query: event.target.value,
                      index: -1,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      revealMatch(event.shiftKey ? -1 : 1);
                    }
                    if (event.key === "Escape") setFindPanel(null);
                  }}
                />
              </label>
              {findPanel.replace && (
                <input
                  aria-label="替换为"
                  placeholder="替换为"
                  value={findPanel.replacement}
                  onChange={(event) =>
                    setFindPanel({
                      ...findPanel,
                      replacement: event.target.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      replaceCurrent();
                    }
                    if (event.key === "Escape") setFindPanel(null);
                  }}
                />
              )}
              <span className="find-count">
                {findPanel.query
                  ? `${Math.min(Math.max(0, findPanel.index + 1), textMatches(editor, findPanel.query).length)}/${textMatches(editor, findPanel.query).length}`
                  : "0/0"}
              </span>
              <button aria-label="上一个" onClick={() => revealMatch(-1)}>
                <Icon name="arrow-up" />
              </button>
              <button aria-label="下一个" onClick={() => revealMatch(1)}>
                <Icon name="arrow-down" />
              </button>
              {findPanel.replace && (
                <>
                  <button className="find-text-action" onClick={replaceCurrent}>
                    替换
                  </button>
                  <button className="find-text-action" onClick={replaceAll}>
                    全部替换
                  </button>
                </>
              )}
              <button aria-label="关闭查找" onClick={() => setFindPanel(null)}>
                <Icon name="x" />
              </button>
            </>
          )}
        </FloatingLayer>
        <FloatingLayer
          open={!!inputLayer}
          anchor={inputLayer?.anchor ? { current: inputLayer.anchor } : undefined}
          point={inputLayer?.anchor ? undefined : inputLayer?.point}
          placement="bottom-start"
          gap={6}
          className="inline-input-popover product-layer"
          onDismiss={() => setInputLayer(null)}
        >
          {inputLayer &&
            (
              <>
                <input
                  autoFocus
                  aria-label="输入内容"
                  placeholder={
                    inputLayer.kind === "link"
                      ? "输入链接地址"
                      : inputLayer.kind === "webResource"
                        ? "输入网页地址"
                        : "输入 LaTeX 公式"
                  }
                  value={inputLayer.value}
                  onChange={(event) =>
                    setInputLayer({ ...inputLayer, value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void applyInput();
                    }
                    if (event.key === "Escape") setInputLayer(null);
                  }}
                />
                <button onClick={() => void applyInput()}>确认</button>
              </>
            )}
        </FloatingLayer>
        {pasteProgress && (
          <div
            className={`large-paste-progress${pasteProgress.status === "failed" ? " is-failed" : ""}`}
            role="status"
            aria-live="polite"
          >
            <div>
              <strong>
                {pasteProgress.status === "failed"
                  ? "粘贴失败，内容已恢复"
                  : "正在粘贴大段内容"}
              </strong>
              <span>
                {pasteProgress.status === "failed"
                  ? "原笔记未被修改"
                  : `${pasteProgress.processed} / ${pasteProgress.total} 个内容块`}
              </span>
            </div>
            {pasteProgress.status === "running" && (
              <progress
                max={pasteProgress.total}
                value={pasteProgress.processed}
              />
            )}
            <button
              type="button"
              onClick={() => {
                if (pasteProgress.status === "running")
                  pasteAbortRef.current = true;
                else setPasteProgress(null);
              }}
            >
              {pasteProgress.status === "running" ? "取消并恢复" : "关闭"}
            </button>
          </div>
        )}
        <div className="editor-word-count" aria-live="polite">
          {editor.getText().replace(/\s/g, "").length} 字
        </div>
        <input
          ref={fileRef}
          hidden
          multiple
          type="file"
          accept="image/*,audio/*,video/*,.pdf,.zip,.txt,.md,.html,.htm,text/html"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void addFiles(files);
            event.target.value = "";
          }}
        />
      </div>
    );
  },
);
