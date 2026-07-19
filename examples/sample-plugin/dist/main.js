// src/index.tsx
import { useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function parse(content) {
  try {
    const d = JSON.parse(content);
    if (d && Array.isArray(d.items)) return { items: d.items };
  } catch {
  }
  return { items: [] };
}
var serialize = (d) => JSON.stringify(d);
var uid = () => Math.random().toString(36).slice(2);
function ChecklistView({ note }) {
  const items = parse(note.content).items;
  const done = useMemo(() => items.filter((i) => i.done).length, [items]);
  if (items.length === 0) return /* @__PURE__ */ jsx("div", { "data-testid": "empty", children: "No items yet \u2014 switch to editing to add some." });
  return /* @__PURE__ */ jsxs("div", { "data-testid": "checklist-view", children: [
    /* @__PURE__ */ jsxs("div", { "data-testid": "progress", children: [
      done,
      "/",
      items.length,
      " done"
    ] }),
    /* @__PURE__ */ jsx("ul", { children: items.map((i) => /* @__PURE__ */ jsxs("li", { "data-done": i.done, children: [
      i.done ? "\u2611" : "\u2610",
      " ",
      i.text
    ] }, i.id)) })
  ] });
}
function ChecklistEditor({ value, onChange }) {
  const [items, setItems] = useState(() => parse(value).items);
  const [draft, setDraft] = useState("");
  const commit = (next) => {
    setItems(next);
    onChange(serialize({ items: next }));
  };
  return /* @__PURE__ */ jsxs("div", { "data-testid": "checklist-editor", children: [
    items.map((i) => /* @__PURE__ */ jsxs("label", { style: { display: "block" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "checkbox",
          "aria-label": i.text,
          checked: i.done,
          onChange: () => commit(items.map((x) => x.id === i.id ? { ...x, done: !x.done } : x))
        }
      ),
      i.text
    ] }, i.id)),
    /* @__PURE__ */ jsx("input", { "aria-label": "new-item", value: draft, onChange: (e) => setDraft(e.target.value), placeholder: "New item" }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => {
          const t = draft.trim();
          if (!t) return;
          commit([...items, { id: uid(), text: t, done: false }]);
          setDraft("");
        },
        children: "Add"
      }
    )
  ] });
}
var plugin = {
  id: "com.jnana.sample-checklist",
  name: "Sample Checklist",
  version: "1.0.0",
  init(ctx) {
    ctx.registerNoteType({
      id: "sample-checklist",
      label: "Checklist",
      newContent: () => serialize({ items: [] }),
      toSearchText: (n) => parse(n.content).items.map((i) => i.text).join("\n"),
      toExportMarkdown: (n) => parse(n.content).items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n"),
      View: ChecklistView,
      Editor: ChecklistEditor
    });
  }
};
var index_default = plugin;
export {
  index_default as default
};
