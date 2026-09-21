import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const CAMEL_CASE_BOUNDARY = /([a-z0-9])([A-Z])/g;
const KEY_SEPARATORS = /[_-]+/g;

function readableLabel(key: string): string {
  const label = key.replace(CAMEL_CASE_BOUNDARY, '$1 $2').replace(KEY_SEPARATORS, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function scalarText(value: unknown): string {
  if (value === null) {
    return 'Not set (null)';
  }
  if (value === undefined) {
    return 'Not set (undefined)';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value === '') {
    return 'Empty string';
  }
  return String(value);
}

interface SettingNode {
  path: string;
  name: string;
  label: string;
  value: unknown;
  children?: SettingNode[];
}

function buildNodes(value: object, path: string[] = []): SettingNode[] {
  return Object.entries(value).map(([name, entry]) => {
    const entryPath = [...path, name];
    const isGroup = entry !== null && typeof entry === 'object';
    // Short scalar arrays are readable inline; large or structured arrays expand.
    const isCompactArray = Array.isArray(entry) && entry.length <= 20 &&
      entry.every((item) => item === null || typeof item !== 'object');
    return {
      path: JSON.stringify(entryPath),
      name,
      label: Array.isArray(value) ? `Item ${Number(name) + 1}` : readableLabel(name),
      value: entry,
      children: isGroup && !isCompactArray
        ? buildNodes(entry, entryPath)
        : undefined,
    };
  });
}

function filterNodes(nodes: SettingNode[], query: string): SettingNode[] {
  return nodes.flatMap((node) => {
    const valueText = node.children ? '' : `${JSON.stringify(node.value)} ${
      Array.isArray(node.value) ? node.value.map(scalarText).join(' ') : scalarText(node.value)
    }`;
    const matches = `${node.name} ${node.label} ${valueText}`.toLowerCase().includes(query);
    if (matches) {
      return [node];
    }
    const children = node.children ? filterNodes(node.children, query) : [];
    return children.length ? [{ ...node, children }] : [];
  });
}

async function copyValue(value: unknown, asJson = false) {
  try {
    const text = typeof value === 'string' && !asJson ? value : JSON.stringify(value, null, 2);
    await navigator.clipboard.writeText(text ?? String(value));
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Could not copy to clipboard');
  }
}

function SettingValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (!value.length) {
      return <span className="text-muted-foreground">Empty list</span>;
    }
    return (
      <ol className="flex flex-wrap gap-1.5" aria-label="Values">
        {Object.entries(value).map(([key, item]) => (
          <li key={key} className="max-w-full whitespace-pre-wrap break-words rounded bg-def-100 px-2 py-1 [overflow-wrap:anywhere]">
            {scalarText(item)}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <span className={value == null ? 'text-muted-foreground' : 'whitespace-pre-wrap [overflow-wrap:anywhere]'}>
      {scalarText(value)}
    </span>
  );
}

function SettingRows({ nodes, searching, expanded, overrides, onToggle, depth = 0 }: {
  nodes: SettingNode[];
  searching: boolean;
  expanded: boolean;
  overrides: Record<string, boolean>;
  onToggle: (path: string, open: boolean) => void;
  depth?: number;
}) {
  return (
    <div className="divide-y">
      {nodes.map((node) => {
        const open = searching || (overrides[node.path] ?? expanded);
        const hasChildren = !!node.children?.length;
        const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
        return (
          <div key={node.path}>
            <div className="flex items-start gap-2 px-3 py-3">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-5">
                <div className="min-w-0">
                  {hasChildren ? (
                    <button type="button" className="flex max-w-full items-center gap-1 rounded text-left font-medium focus-visible:outline focus-visible:outline-2" aria-expanded={open} onClick={() => onToggle(node.path, !open)} disabled={searching}>
                      <Chevron className="size-4 shrink-0" aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">{node.label}</span>
                    </button>
                  ) : <div className="font-medium [overflow-wrap:anywhere]">{node.label}</div>}
                  <code className="mt-1 block text-muted-foreground text-xs [overflow-wrap:anywhere]">{node.name}</code>
                </div>
                <div className="min-w-0 font-mono text-sm">
                  {node.children ? (
                    <span className="font-sans text-muted-foreground">
                      {Object.keys(node.value as object).length} {Array.isArray(node.value) ? 'items' : 'fields'}
                    </span>
                  ) : <SettingValue value={node.value} />}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Copy ${node.name}`} title={`Copy ${node.name}`} onClick={() => copyValue(node.value)}>
                <CopyIcon className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {hasChildren && open && (
              <div className={depth < 3 ? 'mb-2 ml-4 border-l sm:ml-6' : 'mb-2 border-l'}>
                <SettingRows nodes={node.children ?? []} searching={searching} expanded={expanded} overrides={overrides} onToggle={onToggle} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SettingsInspector({ value }: { value: Record<string, unknown> }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const nodes = useMemo(() => buildNodes(value), [value]);
  const query = search.trim().toLowerCase();
  const visibleNodes = useMemo(() => query ? filterNodes(nodes, query) : nodes, [nodes, query]);

  const toggleAll = (open: boolean) => {
    setExpanded(open);
    setOverrides({});
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 text-sm">
      <Input className="shrink-0" type="search" aria-label="Search keys or values" placeholder="Search keys or values…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" disabled={!!query} onClick={() => toggleAll(true)}>Expand all</Button>
        <Button variant="outline" disabled={!!query} onClick={() => toggleAll(false)}>Collapse all</Button>
        <Button variant="outline" icon={CopyIcon} onClick={() => copyValue(value, true)}>Copy JSON</Button>
        {query && <Button variant="ghost" onClick={() => setSearch('')}>Clear search</Button>}
      </div>
      <div className="min-h-0 overflow-y-auto rounded-md border bg-background">
        {visibleNodes.length ? (
          <SettingRows nodes={visibleNodes} searching={!!query} expanded={expanded} overrides={overrides} onToggle={(path, open) => setOverrides((current) => ({ ...current, [path]: open }))} />
        ) : <p role="status" className="p-6 text-center text-muted-foreground">No matching settings.</p>}
      </div>
    </div>
  );
}
