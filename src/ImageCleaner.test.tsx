// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageCleaner from "./ImageCleaner";
import App from "./App";
import { cleanImage } from "./lib/clean-image";

vi.mock("./lib/clean-image", () => ({ cleanImage: vi.fn() }));
// Deliberately fail the production import, as happens without Supabase env vars.
vi.mock("./ProductionDesk", () => { throw new Error("Missing Supabase browser configuration"); });
const createUrl = vi.fn();
const revokeUrl = vi.fn();
const cleaned = { blob: new Blob(["cleaned"], { type: "image/png" }), width: 100, height: 60, removed: 10 };
const file = new File(["original"], "My Art.jpg", { type: "image/jpeg" });

beforeEach(() => {
  let id = 0;
  createUrl.mockImplementation(() => `blob:preview-${++id}`);
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.mocked(cleanImage).mockResolvedValue(cleaned);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("restored Design Drop path", () => {
  it("chooses, cleans, previews, and offers the actual cleaned blob for PNG download", async () => {
    const user = userEvent.setup();
    render(<ImageCleaner />);
    const button = screen.getByRole("button", { name: "Clean image" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
    await user.upload(screen.getByLabelText("Choose image"), file);
    expect(screen.getByAltText("Original artwork")).toBeTruthy();
    await user.click(button);
    const link = await screen.findByRole("link", { name: /Save \/ download/ });
    expect(cleanImage).toHaveBeenCalledWith(file, 20);
    expect(createUrl).toHaveBeenCalledWith(cleaned.blob);
    expect(link.getAttribute("download")).toBe("My-Art-cleaned.png");
    expect(link.getAttribute("href")).toBe(screen.getByAltText("Cleaned artwork with transparent background").getAttribute("src"));
    expect(screen.getByText(/100 × 60 px/)).toBeTruthy();
    cleanup();
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview-1");
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview-2");
  });

  it("invalidates old downloads when the strength or selected image changes", async () => {
    const user = userEvent.setup();
    render(<ImageCleaner />);
    await user.upload(screen.getByLabelText("Choose image"), file);
    await user.click(screen.getByRole("button", { name: "Clean image" }));
    await screen.findByRole("link");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
    expect(screen.queryByRole("link")).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview-2");
    await user.click(screen.getByRole("button", { name: "Clean image" }));
    await screen.findByRole("link");
    expect(cleanImage).toHaveBeenLastCalledWith(file, 40);
    await user.upload(screen.getByLabelText("Choose image"), new File(["next"], "next.png", { type: "image/png" }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByAltText("Cleaned artwork with transparent background")).toBeNull();
  });

  it("shows validation and cleaning errors, disables actions while working, and allows retry", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<ImageCleaner />);
    await user.upload(screen.getByLabelText("Choose image"), new File(["svg"], "art.svg", { type: "image/svg+xml" }));
    expect(screen.getByRole("alert").textContent).toContain("PNG or JPG");
    expect(cleanImage).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText("Choose image"), file);
    let reject: (error: Error) => void = () => {};
    vi.mocked(cleanImage).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await user.click(screen.getByRole("button", { name: "Clean image" }));
    expect((screen.getByRole("button", { name: /Cleaning image/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Choose image") as HTMLInputElement).disabled).toBe(true);
    reject(new Error("Decode failed"));
    expect((await screen.findByRole("alert")).textContent).toBe("Decode failed");
    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clean image" }));
    expect(await screen.findByRole("link")).toBeTruthy();
  });

  it("opens the cleaner without production credentials and retains its result when switching workspaces", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole("alert")).toBeNull();
    await user.upload(screen.getByLabelText("Choose image"), file);
    await user.click(screen.getByRole("button", { name: "Clean image" }));
    await screen.findByRole("link");
    await user.click(screen.getByRole("button", { name: "Printful / Shopify production desk" }));
    expect((await screen.findByRole("alert")).textContent).toContain("production desk could not load");
    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Design Drop · image cleaner" }));
    await waitFor(() => expect(screen.getByRole("link").getAttribute("download")).toBe("My-Art-cleaned.png"));
    expect(cleanImage).toHaveBeenCalledTimes(1);
  });
});
