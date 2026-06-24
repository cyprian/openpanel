import { createFileRoute } from '@tanstack/react-router';
import {
  ActivityIcon,
  BarChart3Icon,
  BrainCircuitIcon,
  CopyIcon,
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
import { Button } from '@/components/ui/button';
import { clipboard } from '@/utils/clipboard';
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
  { href: '#package-install', label: 'Package install' },
  { href: '#authentication', label: 'Authentication' },
  { href: '#instrument-training-code', label: 'Instrument code' },
  { href: '#track-metrics', label: 'Track metrics' },
  { href: '#visual-outputs', label: 'Visual outputs' },
  { href: '#artifacts-and-metadata', label: 'Local artifacts' },
  { href: '#offline-and-sync', label: 'Offline sync' },
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
    description: 'Upload any named visual output your project needs.',
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
  text: 'markdown',
  ts: 'typescript',
};

const content = `## Quick start

Use ML projects for model families like **Iris Segmentation**, **Iris Detection**, **NAFNet**, or **LaMa**. A project can contain many training runs with scalar metrics, images, local artifacts, configuration, metadata, notes, and tags.

> ML projects reuse OpenPanel organizations, users, project settings, clients, and authentication while hiding analytics sections that are not useful for experiment tracking.

### Step 1: Create an ML project

Create a project from the OpenPanel dashboard and choose **ML** as the project type.

Use one ML project for each model family, dataset, or training objective you want to compare over time.

### Step 2: Install the Python package

OpenPanel ML is distributed as the \`openpanel-ml\` Python package. This OpenPanel instance hosts the package registry, so you can install it without PyPI:

\`\`\`bash
python -m pip install --index-url https://analytics.eyepic.io/packages/simple openpanel-ml
\`\`\`

If you still want PyPI available for optional dependencies, use OpenPanel as an extra package index:

\`\`\`bash
python -m pip install --extra-index-url https://analytics.eyepic.io/packages/simple openpanel-ml
\`\`\`

Upgrade an existing environment with:

\`\`\`bash
python -m pip install --upgrade --index-url https://analytics.eyepic.io/packages/simple openpanel-ml
\`\`\`

### Step 3: Authenticate

Create a write client from project settings, then either log in once on the machine:

\`\`\`bash
openpanel-ml login
openpanel-ml status
\`\`\`

Or expose credentials to a training job:

\`\`\`bash
export OPENPANEL_CLIENT_ID="your-client-id"
export OPENPANEL_CLIENT_SECRET="your-client-secret"
export OPENPANEL_SERVER_URL="https://analytics.eyepic.io"
\`\`\`

The SDK can use OS secure storage through \`keyring\` when installed. It falls back to a local config file when secure storage is unavailable.

\`\`\`bash
python -m pip install "openpanel-ml[secure-storage]"
\`\`\`

### Step 4: Start a run in training code

Training scripts import \`openpanel_ml\`:

\`\`\`python
import openpanel_ml as opml

run = opml.init(
    project="eyepic-iris-detection-mobile",
    experiment="iris-unet-baseline-001",
    tags=["baseline", "64x64"],
    config={
        "model": "UNet",
        "learning_rate": 1e-4,
        "batch_size": 16,
        "optimizer": "adamw",
    },
    metadata={
        "dataset": "eyepic-iris-v1",
        "trainer": "pytorch",
    },
)
\`\`\`

The SDK is silent by default. Enable lifecycle logs when you want start and finish messages with the run URL and local data path:

\`\`\`python
run = opml.init(
    project="eyepic-iris-detection-mobile",
    experiment="iris-unet-baseline-001",
    silent=False,
)
\`\`\`

Enable data sync logs when debugging what was sent:

\`\`\`python
run = opml.init(
    project="eyepic-iris-detection-mobile",
    experiment="iris-unet-baseline-001",
    silent=False,
    log_data=True,
)
\`\`\`

## Package install

| Task | Command |
| --- | --- |
| Install from OpenPanel only | \`python -m pip install --index-url https://analytics.eyepic.io/packages/simple openpanel-ml\` |
| Install with PyPI fallback | \`python -m pip install --extra-index-url https://analytics.eyepic.io/packages/simple openpanel-ml\` |
| Upgrade package | \`python -m pip install --upgrade --index-url https://analytics.eyepic.io/packages/simple openpanel-ml\` |
| Install secure-storage extra | \`python -m pip install "openpanel-ml[secure-storage]"\` |
| Install from GitHub tag | \`python -m pip install "openpanel-ml @ git+https://github.com/cyprian/openpanel-python-ml.git@openpanel-ml-v0.0.6"\` |

Current published version: \`0.0.6\`.

## Authentication

\`\`\`bash
openpanel-ml login
openpanel-ml status
openpanel-ml logout
\`\`\`

\`openpanel-ml login\` prompts for a client ID and client secret. You can also pass them explicitly:

\`\`\`bash
openpanel-ml login --client-id your-client-id --client-secret your-client-secret
\`\`\`

For CI, notebooks, or remote training jobs, environment variables are usually easier:

\`\`\`bash
export OPENPANEL_CLIENT_ID="your-client-id"
export OPENPANEL_CLIENT_SECRET="your-client-secret"
export OPENPANEL_SERVER_URL="https://analytics.eyepic.io"
\`\`\`

## Instrument training code

Use this minimal pattern when adding OpenPanel ML to a training script:

\`\`\`python
import openpanel_ml as opml

run = opml.init(
    project="eyepic-iris-detection-mobile",
    experiment="experiment-name",
    config={
        "model": "your-model",
        "learning_rate": 1e-4,
        "batch_size": 16,
    },
    tags=["baseline"],
)

try:
    for step in range(total_steps):
        metrics = train_step()
        run.log(
            {
                "loss": metrics["loss"],
                "iou": metrics["iou"],
                "dice": metrics["dice"],
            },
            step=step,
        )
    run.finish("finished")
except Exception:
    run.finish("failed")
    raise
\`\`\`

The SDK creates a local run id immediately, then stores the server UUID returned by OpenPanel after the first sync. Metrics, images, and status updates automatically use the server UUID once it is available.

## Track metrics

Use \`run.log()\` for any scalar series you want to plot or compare. The same call can include training loss, validation metrics, learning rate, throughput, or custom domain metrics.

\`\`\`python
for step in range(1000):
    loss = train_step()
    iou, dice = evaluate_batch()

    run.log(
        {
            "loss": loss,
            "iou": iou,
            "dice": dice,
        },
        step=step,
        epoch=step // 100,
    )
\`\`\`

Metrics appear as run charts with axes, hover tooltips, and final metric summaries. The final value for each metric is also available in run tables and comparison views.

## Visual outputs

Log image outputs directly from your training or evaluation loop. Images can be local file paths or bytes, and the image name becomes the dashboard label.

\`\`\`python
run.log_image(
    "prediction",
    "outputs/result-0001.png",
    step=120,
    epoch=1,
    metadata={"stage": "val", "sample": "sample_0001", "kind": "prediction"},
)
\`\`\`

Use stable names such as \`ground_truth\`, \`prediction\`, \`mask\`, \`overlay\`, or \`pixel_diff_heatmap\` when you want images to line up as columns in the dashboard. Put sample-specific details in \`metadata\`: stage, sample id, class, threshold, fold, or dataset split. The SDK accepts slashes in image names for readability, but local filenames are sanitized before they are written to disk.

Use \`every\` to reduce upload volume:

\`\`\`python
run.log_image(
    "pixel_diff_heatmap",
    heatmap_png_bytes,
    filename="heatmap-0120.png",
    content_type="image/png",
    step=120,
    metadata={"stage": "val", "sample": "sample_0042"},
    every=50,
)
\`\`\`

Log multiple images for the same step with \`run.log_images()\`. The order you provide is the order used in visual comparisons.

\`\`\`python
run.log_images(
    {
        "input": "samples/input-00042.png",
        "ground_truth": "samples/gt-00042.png",
        "prediction": "outputs/result-00042.png",
        "pixel_diff_heatmap": "outputs/heatmap-00042.png",
    },
    step=250,
    epoch=2,
    metadata={"stage": "val", "sample": "sample_0042"},
)
\`\`\`

Evaluation rows are also flexible. Send one image, two images, or ten named images for a sample; the table columns are derived from the image names in the order they are logged.

\`\`\`python
run.log_evaluation(
    sample_id="sample-00042",
    step=250,
    epoch=2,
    metrics={"dice": 0.94, "iou": 0.89},
    metadata={"stage": "val", "fold": 1},
    images={
        "ground_truth": "samples/gt-00042.png",
        "prediction": "outputs/result-00042.png",
        "pixel_diff_heatmap": "outputs/heatmap-00042.png",
    },
)
\`\`\`

Use the richer list form when individual images need captions, content types, filenames, or per-image metadata:

\`\`\`python
run.log_evaluation(
    sample_id="sample-00042",
    step=250,
    images=[
        {
            "name": "pixel_diff_heatmap",
            "image": heatmap_png_bytes,
            "filename": "heatmap-00042.png",
            "content_type": "image/png",
            "caption": "Absolute prediction error",
            "metadata": {"threshold": 0.4},
        }
    ],
)
\`\`\`

## Local artifacts and metadata

Use artifacts for checkpoints, model files, exported reports, or evaluation outputs that should stay with the local run directory. Artifact server upload is not enabled yet, so artifacts are copied locally and are not sent to OpenPanel.

\`\`\`python
run.upload_artifact(
    "best-model",
    "checkpoints/best.pt",
    artifact_type="checkpoint",
    metadata={"metric": "dice", "score": 0.97},
)
\`\`\`

Update config, tags, and notes as the job discovers more context:

\`\`\`python
run.config.update({"scheduler": "cosine", "augmentation": "heavy"})
run.tags(["baseline", "mobile", "iris"])
run.notes("Baseline run with mobile-sized input and cosine scheduler.")
\`\`\`

## Offline and sync

Every metric, image, local artifact, config update, tag update, note, and status change is written to \`./openpanel-ml/\` before network sync is attempted. Training does not block on OpenPanel availability.

\`\`\`text
openpanel-ml/
├── runs/
│   └── run_.../
│       ├── metadata.json
│       ├── metrics.jsonl
│       ├── system.json
│       ├── config.json
│       ├── artifacts/
│       ├── images/
│       └── checkpoints/
├── queue/
│   ├── pending/
│   ├── failed/
│   └── completed/
├── cache/
├── logs/
└── settings.json
\`\`\`

Use offline mode when a job cannot reach OpenPanel:

\`\`\`python
run = opml.init(project="eyepic-iris-detection-mobile", offline=True)
run.log({"loss": 0.42})
run.finish()
\`\`\`

Sync queued local events later:

\`\`\`bash
openpanel-ml sync
openpanel-ml sync --root ./openpanel-ml
openpanel-ml sync --force
\`\`\`

Inspect the queue without contacting OpenPanel:

\`\`\`bash
openpanel-ml queue status
openpanel-ml queue status --root ./openpanel-ml
\`\`\`

\`sync --force\` retries pending events even when they have a future \`next_attempt_at\`. Permanent client errors, such as malformed payloads, move to \`queue/failed\`; retryable network, auth, rate-limit, and conflict errors stay in \`queue/pending\` with retry metadata.

Resume the latest unfinished local run for a project:

\`\`\`python
run = opml.init(project="eyepic-iris-detection-mobile", resume=True)
\`\`\`

## Finish runs

Always finish a run so dashboards can separate finished, running, and failed experiments cleanly.

\`\`\`python
run.finish("finished")
\`\`\`

\`completed\` is accepted as a compatibility alias, but new code should use \`finished\`.

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
| Images | named visual outputs attached to runs |
| Compare | overlaid metric charts, hyperparameters, metadata, and final metrics |

## Storage

Self-hosted OpenPanel stores uploaded ML images on the server by default. Configure the ML storage directory with:

\`\`\`bash
ML_STORAGE_DIR=/var/lib/openpanel/ml
\`\`\`

This keeps visual outputs on your infrastructure. The storage layer is intentionally isolated so S3 or Google Cloud Storage can be added later.

The OpenPanel package registry is also hosted by this OpenPanel instance:

\`\`\`bash
https://analytics.eyepic.io/packages/simple
\`\`\`

## HTTP API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| \`POST\` | \`/ml/runs\` | create a run |
| \`PATCH\` | \`/ml/runs/:runId\` | update run status or metadata |
| \`POST\` | \`/ml/runs/:runId/log\` | log scalar metrics |
| \`POST\` | \`/ml/runs/:runId/images\` | upload a run image |
| \`POST\` | \`/ml/runs/:runId/evaluations\` | log a visual evaluation table row |

Single image payloads use a required \`name\`. Prefer stable names and move sample-specific labels into \`metadata\`:

\`\`\`json
{
  "name": "overlay",
  "step": 120,
  "epoch": 1,
  "filename": "overlay-0120.png",
  "contentType": "image/png",
  "image": "base64-or-data-url",
  "metadata": {
    "stage": "val",
    "sample": "sample_0042"
  }
}
\`\`\`

Evaluation payloads use an ordered \`images\` array. Each item needs its own \`name\`; there are no fixed image types. Use the same image names for every sample when you want the dashboard columns to stay stable.
`;

const copyContent = `OpenPanel ML Tracking Docs

${content}`;

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
        actions={
          <Button
            icon={CopyIcon}
            onClick={() => clipboard(copyContent, 'ML tracking docs copied')}
            variant="outline"
          >
            Copy
          </Button>
        }
        className="mb-8"
        description="Use the Python SDK to log training runs, metrics, images, local artifacts, and model metadata."
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
              project: runs, charts, images, local artifacts, comparisons, and
              the API surface used by the SDK.
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
