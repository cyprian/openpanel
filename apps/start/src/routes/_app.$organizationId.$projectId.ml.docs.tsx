import { createFileRoute } from '@tanstack/react-router';
import {
  ActivityIcon,
  BarChart3Icon,
  BrainCircuitIcon,
  DatabaseIcon,
  ImagesIcon,
  Rows3Icon,
  TerminalIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { Markdown } from '@/components/markdown';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import Syntax, { type SyntaxLanguage } from '@/components/syntax';
import { cn } from '@/utils/cn';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/docs'
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Tracking Docs') }],
  }),
});

const navigationItems = [
  { href: '#quick-start', label: 'Quick start' },
  { href: '#track-metrics', label: 'Track metrics' },
  { href: '#visual-outputs', label: 'Visual outputs' },
  { href: '#finish-runs', label: 'Finish runs' },
  { href: '#dashboard-areas', label: 'Dashboard areas' },
  { href: '#storage', label: 'Storage' },
  { href: '#http-api', label: 'HTTP API' },
] as const;

const summaryCards = [
  {
    title: 'Runs',
    description: 'Track status, notes, tags, metadata, and final metrics.',
    icon: ActivityIcon,
  },
  {
    title: 'Charts',
    description: 'Plot loss, PSNR, SSIM, LPIPS, and any scalar metric.',
    icon: BarChart3Icon,
  },
  {
    title: 'Images',
    description: 'Upload predictions, ground truth, and error maps.',
    icon: ImagesIcon,
  },
  {
    title: 'Evaluations',
    description: 'Compare per-sample metrics and visual outputs together.',
    icon: Rows3Icon,
  },
] as const;

const supportedLanguages = new Set<SyntaxLanguage>([
  'typescript',
  'python',
  'bash',
  'json',
  'markdown',
]);

const languageAliases: Record<string, SyntaxLanguage> = {
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
};

const content = `## Quick start

Use ML projects for model families like **NAFNet**, **LaMa**, **Cosmos**, or **Iris Segmentation**. A project can contain many training runs with scalar metrics, images, visual evaluation tables, configuration, metadata, notes, and tags.

> ML projects reuse OpenPanel organizations, users, project settings, clients, and authentication while hiding analytics sections that are not useful for experiment tracking.

### 1. Create an ML project

Create a project and choose **ML** as the project type. Use a separate ML project for each model family, dataset, or training objective that you want to compare over time.

### 2. Configure client credentials

Create a write client from project settings and expose it to your training job.

\`\`\`bash
export OPENPANEL_API_URL="https://analytics.eyepic.io"
export OPENPANEL_CLIENT_ID="your-client-id"
export OPENPANEL_CLIENT_SECRET="your-client-secret"
\`\`\`

### 3. Install the Python SDK

\`\`\`bash
pip install ./packages/sdks/python
\`\`\`

The SDK package is named \`openpanel-ml\`, and training scripts import \`openpanel.ml\`.

### 4. Start a run

\`\`\`python
import openpanel.ml as openpanel

run = openpanel.init(
    project="NAFNet",
    name="nafnet-baseline-001",
    tags=["baseline", "64x64"],
    config={
        "model": "NAFNet",
        "learning_rate": 1e-4,
        "batch_size": 16,
        "optimizer": "adamw",
    },
    metadata={
        "dataset": "synthetic-rain",
        "trainer": "pytorch",
    },
)
\`\`\`

## Track metrics

Use \`run.log()\` for any scalar series you want to plot or compare. The same call can include training loss, validation metrics, learning rate, throughput, or custom domain metrics.

\`\`\`python
for step in range(1000):
    loss = train_step()
    psnr, ssim = evaluate_batch()

    run.log(
        {
            "loss": loss,
            "psnr": psnr,
            "ssim": ssim,
        },
        step=step,
        epoch=step // 100,
    )
\`\`\`

Metrics appear as run charts with axes, hover tooltips, and final metric summaries. The final value for each metric is also available in run tables and comparison views.

## Visual outputs

Log image artifacts directly from your training or evaluation loop. Images can be local paths, bytes, or other values accepted by the SDK.

\`\`\`python
run.log_image(
    "outputs/prediction-0001.png",
    kind="prediction",
    step=120,
    epoch=1,
    caption="Validation prediction",
)
\`\`\`

Use \`every\` to reduce upload volume:

\`\`\`python
run.log_image(
    prediction_png_bytes,
    kind="prediction",
    content_type="image/png",
    every=50,
)
\`\`\`

### Visual evaluation rows

Visual evaluation rows are useful for comparing input images, ground truth, predictions, error maps, and per-sample metrics in one table.

\`\`\`python
run.log_evaluation(
    sample_id="val-00042",
    input="samples/input-00042.png",
    ground_truth="samples/gt-00042.png",
    prediction="outputs/pred-00042.png",
    error_map="outputs/error-00042.png",
    metrics={
        "psnr": 34.5,
        "ssim": 0.94,
        "lpips": 0.08,
    },
    step=250,
    epoch=2,
    metadata={
        "split": "validation",
        "scene": "indoor",
    },
)
\`\`\`

The run page shows these rows with image thumbnails, metric columns, search, sorting, and pagination.

## Finish runs

Always finish a run so dashboards can separate completed, running, and failed experiments cleanly.

\`\`\`python
run.finish("finished")
\`\`\`

Use \`failed\` when a training job exits unsuccessfully:

\`\`\`python
run.finish("failed")
\`\`\`

## Dashboard areas

| Area | What it shows |
| --- | --- |
| ML Projects | model or experiment groups |
| Runs | all runs across the current OpenPanel project |
| Run detail | final metrics, metric charts, config, metadata, notes, tags, and images |
| Evaluation table | input, ground truth, prediction, error map, PSNR, SSIM, LPIPS, epoch, and step |
| Compare | overlaid metric charts, hyperparameters, metadata, and final metrics |

## Storage

Self-hosted OpenPanel stores uploaded ML images on the server by default. Configure the storage directory with:

\`\`\`bash
ML_STORAGE_DIR=/var/lib/openpanel/ml
\`\`\`

This keeps visual outputs on your infrastructure. The storage layer is intentionally isolated so S3 or Google Cloud Storage can be added later.

## HTTP API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| \`POST\` | \`/ml/runs\` | create a run |
| \`PATCH\` | \`/ml/runs/:runId\` | update run status or metadata |
| \`POST\` | \`/ml/runs/:runId/log\` | log scalar metrics |
| \`POST\` | \`/ml/runs/:runId/images\` | upload a run image |
| \`POST\` | \`/ml/runs/:runId/evaluations\` | log a visual evaluation table row |
`;

function nodeToText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return node.toString();
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).join('');
  }

  return '';
}

function slugify(value: ReactNode) {
  return nodeToText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveLanguage(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  const aliased = languageAliases[normalized] ?? normalized;

  if (supportedLanguages.has(aliased as SyntaxLanguage)) {
    return aliased as SyntaxLanguage;
  }

  return undefined;
}

const markdownComponents: Components = {
  blockquote({ children }) {
    return (
      <div className="not-prose my-6 rounded-md border border-highlight/25 bg-highlight/5 p-4">
        <div className="flex gap-3">
          <BrainCircuitIcon className="mt-0.5 size-4 shrink-0 text-highlight" />
          <div className="text-muted-foreground text-sm leading-6">
            {children}
          </div>
        </div>
      </div>
    );
  },
  code({ children, className, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '');
    const language = resolveLanguage(match?.[1]);
    const code = nodeToText(children).replace(/\n$/, '');

    if (language) {
      return (
        <Syntax
          className="not-prose my-5 border bg-card"
          code={code}
          language={language}
          wrapLines
        />
      );
    }

    return (
      <code
        className={cn(
          'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground',
          className
        )}
        {...(props as ComponentProps<'code'>)}
      >
        {children}
      </code>
    );
  },
  h2({ children }) {
    return (
      <h2 className="scroll-mt-24" id={slugify(children)}>
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="scroll-mt-24" id={slugify(children)}>
        {children}
      </h3>
    );
  },
  table({ children }) {
    return (
      <div className="not-prose my-6 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">{children}</table>
      </div>
    );
  },
  td({ children }) {
    return (
      <td className="border-t px-4 py-3 align-top text-muted-foreground">
        {children}
      </td>
    );
  },
  th({ children }) {
    return (
      <th className="bg-muted/50 px-4 py-3 font-medium text-foreground">
        {children}
      </th>
    );
  },
};

function Component() {
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        className="mb-8"
        description="Use the Python SDK to log training runs, metrics, images, and visual evaluation tables."
        title="ML Tracking Docs"
      />

      <section className="mb-6 rounded-md border bg-card p-6">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 font-medium text-muted-foreground text-xs">
              <TerminalIcon className="size-3.5" />
              Python SDK
            </div>
            <h2 className="max-w-2xl font-semibold text-3xl tracking-tight">
              Experiment tracking for metrics, images, and evaluations
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground leading-7">
              Keep training telemetry next to the rest of your OpenPanel
              project: runs, charts, visual artifacts, comparisons, and the API
              surface used by the SDK.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {summaryCards.map((item) => (
              <div
                className="rounded-md border bg-background p-4"
                key={item.title}
              >
                <item.icon className="mb-3 size-4 text-highlight" />
                <div className="font-medium">{item.title}</div>
                <p className="mt-1 text-muted-foreground text-sm leading-6">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-8 rounded-md border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 font-medium text-sm">
              <DatabaseIcon className="size-4 text-highlight" />
              On this page
            </div>
            <nav className="grid gap-1">
              {navigationItems.map((item) => (
                <a
                  className="rounded px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <article className="rounded-md border bg-card p-6 md:p-8">
          <div className="prose dark:prose-invert max-w-none prose-h2:border-t prose-h2:pt-8 prose-headings:font-semibold prose-a:text-highlight prose-li:text-muted-foreground prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none prose-h2:first:border-t-0 prose-h2:first:pt-0">
            <Markdown components={markdownComponents}>{content}</Markdown>
          </div>
        </article>
      </div>
    </PageContainer>
  );
}
