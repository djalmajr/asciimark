import { beforeEach, describe, expect, it } from "bun:test";
import {
  getStoredAiEngine,
  getStoredAiMode,
  getStoredAiModel,
  getStoredAiSmallModel,
  getStoredAiStreaming,
  getStoredIndexingTier,
  setStoredAiEngine,
  setStoredAiMode,
  setStoredAiModel,
  setStoredAiSmallModel,
  setStoredAiStreaming,
  setStoredIndexingTier,
} from "./ai-prefs.ts";
import { installLocalStorageMock } from "./test-utils.ts";

installLocalStorageMock();

describe("ai preferences defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults: no model, lite tier, ai-sdk engine, streaming off", () => {
    expect(getStoredAiModel()).toBeNull();
    expect(getStoredAiSmallModel()).toBeNull();
    expect(getStoredIndexingTier()).toBe("lite");
    expect(getStoredAiEngine()).toBe("ai-sdk");
    expect(getStoredAiStreaming()).toBe(false);
    expect(getStoredAiMode()).toBe("build");
  });

  it("falls back to build for an unknown/garbage mode value", () => {
    localStorage.setItem("asciimark-ai-mode", "garbage");
    expect(getStoredAiMode()).toBe("build");
  });

  it("falls back to lite for a corrupted tier value", () => {
    localStorage.setItem("asciimark-ai-indexing-tier", "garbage");
    expect(getStoredIndexingTier()).toBe("lite");
  });

  it("falls back to ai-sdk for an unknown engine value", () => {
    localStorage.setItem("asciimark-ai-engine", "nope");
    expect(getStoredAiEngine()).toBe("ai-sdk");
  });
});

describe("ai preferences round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the selected model and clears it with null", () => {
    setStoredAiModel("ollama/llama3.1:8b");
    expect(getStoredAiModel()).toBe("ollama/llama3.1:8b");
    setStoredAiModel(null);
    expect(getStoredAiModel()).toBeNull();
  });

  it("persists the small model independently", () => {
    setStoredAiSmallModel("anthropic/claude-haiku-4-5");
    expect(getStoredAiSmallModel()).toBe("anthropic/claude-haiku-4-5");
  });

  it("persists tier and engine", () => {
    setStoredIndexingTier("full");
    expect(getStoredIndexingTier()).toBe("full");
    setStoredAiEngine("tanstack");
    expect(getStoredAiEngine()).toBe("tanstack");
  });

  it("persists the streaming flag", () => {
    setStoredAiStreaming(true);
    expect(getStoredAiStreaming()).toBe(true);
    setStoredAiStreaming(false);
    expect(getStoredAiStreaming()).toBe(false);
  });

  it("persists the chat mode (build ↔ plan)", () => {
    setStoredAiMode("plan");
    expect(getStoredAiMode()).toBe("plan");
    setStoredAiMode("build");
    expect(getStoredAiMode()).toBe("build");
  });
});
