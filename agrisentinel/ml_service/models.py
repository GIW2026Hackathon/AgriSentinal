"""Torch model definitions for AgriSentinel vision and shelf-life models."""

import torch
import torch.nn as nn

from crops import CROP_KEYS

SEQ_FEATURES = 9
STATIC_FEATURES = len(CROP_KEYS) + 4


class QualityCNN(nn.Module):
    """Small convolutional grader: fresh / ripe / overripe / defective."""

    def __init__(self, num_classes=4):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 24, 3, padding=1),
            nn.BatchNorm2d(24),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(24, 48, 3, padding=1),
            nn.BatchNorm2d(48),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(48, 96, 3, padding=1),
            nn.BatchNorm2d(96),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(96, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.18),
            nn.Linear(64, num_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))


class ShelfLifeLSTM(nn.Module):
    """3-day weather sequence + produce context -> log shelf life in days."""

    def __init__(self, hidden=40):
        super().__init__()
        self.lstm = nn.LSTM(SEQ_FEATURES, hidden, batch_first=True)
        self.head = nn.Sequential(
            nn.Linear(hidden + STATIC_FEATURES, 48),
            nn.ReLU(inplace=True),
            nn.Dropout(0.08),
            nn.Linear(48, 1),
        )

    def forward(self, seq, static):
        out, _ = self.lstm(seq)
        return self.head(torch.cat([out[:, -1, :], static], dim=1)).squeeze(-1)
