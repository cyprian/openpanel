import math
import os
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

import openpanel


def load_credentials(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in Path(path).read_text().splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


class TinyImageModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 4, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(4, 2),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def make_dataset() -> TensorDataset:
    generator = torch.Generator().manual_seed(28)
    images = torch.rand((64, 1, 64, 64), generator=generator)
    center = images[:, :, 24:40, 24:40].mean(dim=(1, 2, 3))
    labels = (center > 0.5).long()
    return TensorDataset(images, labels)


def main() -> None:
    credentials_path = os.environ.get(
        "OPENPANEL_CREDENTIALS",
        "/Users/cyprian/Downloads/credentials.txt",
    )
    credentials = load_credentials(credentials_path)

    run = openpanel.init(
        api_url=os.environ.get("OPENPANEL_API_URL", "https://analytics.eyepic.io"),
        client_id=credentials["CLIENT_ID"],
        client_secret=credentials["CLIENT_SECRET"],
        project=os.environ.get("OPENPANEL_ML_PROJECT", "Tiny 64x64 Smoke Test"),
        name=os.environ.get("OPENPANEL_RUN_NAME", "tiny-cnn-64x64"),
        config={
            "image_size": 64,
            "channels": 1,
            "epochs": 5,
            "batch_size": 8,
            "optimizer": "sgd",
            "learning_rate": 0.1,
        },
        metadata={
            "purpose": "production smoke test",
            "dataset": "synthetic center brightness",
        },
        tags=["smoke-test", "tiny-cnn", "64x64"],
    )

    dataset = make_dataset()
    loader = DataLoader(dataset, batch_size=8, shuffle=True)
    model = TinyImageModel()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.1)
    criterion = nn.CrossEntropyLoss()

    global_step = 0
    for epoch in range(5):
        correct = 0
        total = 0
        epoch_loss = 0.0
        for images, labels in loader:
            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()

            predictions = logits.argmax(dim=1)
            correct += int((predictions == labels).sum().item())
            total += int(labels.numel())
            epoch_loss += float(loss.item()) * int(labels.numel())

            run.log(
                {
                    "batch_loss": float(loss.item()),
                    "batch_accuracy": float((predictions == labels).float().mean().item()),
                },
                step=global_step,
                epoch=epoch,
            )
            global_step += 1

        average_loss = epoch_loss / total
        accuracy = correct / total
        psnr_like = 20 * math.log10(1 / max(average_loss, 1e-6))
        run.log(
            {
                "loss": average_loss,
                "accuracy": accuracy,
                "psnr": psnr_like,
            },
            step=global_step,
            epoch=epoch,
        )
        global_step += 1

    run.finish()
    print(f"OpenPanel smoke run completed: {run.id}")


if __name__ == "__main__":
    main()
