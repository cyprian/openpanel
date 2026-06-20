import { Markdown } from '@/components/markdown';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { createProjectTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/docs',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Tracking Docs') }],
  }),
});

const content = `## Track ML experiments with OpenPanel

Use ML projects for model families like NAFNet, LaMa, Cosmos, or Iris Segmentation. Each project can contain many training runs with scalar metrics, images, visual evaluation tables, configuration, metadata, notes, and tags.

### 1. Create an ML project

Create a project and choose **ML** as the project type. ML projects reuse OpenPanel organizations, users, project settings, clients, and authentication, while hiding analytics sections that are not useful for experiment tracking.

### 2. Configure client credentials

Create a write client from project settings and expose it to your training job:

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

### 5. Log scalar metrics

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

Metrics appear as run charts with axes, hover tooltips, and final metric summaries.

### 6. Log images

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

### 7. Log visual evaluation rows

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

### 8. Finish the run

\`\`\`python
run.finish("finished")
\`\`\`

Use \`failed\` when a training job exits unsuccessfully:

\`\`\`python
run.finish("failed")
\`\`\`

### Dashboard areas

| Area | What it shows |
| --- | --- |
| ML Projects | model or experiment groups |
| Runs | all runs across the current OpenPanel project |
| Run detail | final metrics, metric charts, config, metadata, notes, tags, and images |
| Evaluation table | input, ground truth, prediction, error map, PSNR, SSIM, LPIPS, epoch, and step |
| Compare | overlaid metric charts, hyperparameters, metadata, and final metrics |

### Storage

Self-hosted OpenPanel stores uploaded ML images on the server by default. Configure the storage directory with:

\`\`\`bash
ML_STORAGE_DIR=/var/lib/openpanel/ml
\`\`\`

This keeps visual outputs on your infrastructure. The storage layer is intentionally isolated so S3 or Google Cloud Storage can be added later.

### HTTP API used by the SDK

| Method | Endpoint | Purpose |
| --- | --- | --- |
| \`POST\` | \`/ml/runs\` | create a run |
| \`PATCH\` | \`/ml/runs/:runId\` | update run status or metadata |
| \`POST\` | \`/ml/runs/:runId/log\` | log scalar metrics |
| \`POST\` | \`/ml/runs/:runId/images\` | upload a run image |
| \`POST\` | \`/ml/runs/:runId/evaluations\` | log a visual evaluation table row |
`;

function Component() {
  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description="Use the Python SDK to log training runs, metrics, images, and visual evaluation tables."
        title="ML Tracking Docs"
      />
      <section className="rounded-md border bg-card p-6">
        <div className="prose dark:prose-invert max-w-none">
          <Markdown>{content}</Markdown>
        </div>
      </section>
    </PageContainer>
  );
}
