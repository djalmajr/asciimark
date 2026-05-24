import { describe, expect, it } from "bun:test";
import {
  ADOC_EXTENSIONS,
  cn,
  escapeHtml,
  fileKind,
  fileManagerKind,
  IGNORED_DIRS,
  IMAGE_EXTENSIONS,
  isAdocFile,
  isMdFile,
  isSupportedFile,
  MD_EXTENSIONS,
  PDF_EXTENSIONS,
} from "./utils.ts";

describe("isAdocFile", () => {
  it.each(ADOC_EXTENSIONS)("recognizes %s as AsciiDoc", (ext) => {
    expect(isAdocFile(`doc${ext}`)).toBe(true);
  });

  it("returns false for non-asciidoc extensions", () => {
    expect(isAdocFile("doc.md")).toBe(false);
    expect(isAdocFile("doc.txt")).toBe(false);
    expect(isAdocFile("doc")).toBe(false);
  });

  it("matches by suffix so paths with directories work", () => {
    expect(isAdocFile("/abs/path/notes.adoc")).toBe(true);
  });
});

describe("isMdFile", () => {
  it.each(MD_EXTENSIONS)("recognizes %s as Markdown", (ext) => {
    expect(isMdFile(`doc${ext}`)).toBe(true);
  });

  it("returns false for non-markdown extensions", () => {
    expect(isMdFile("doc.adoc")).toBe(false);
    expect(isMdFile("README")).toBe(false);
  });
});

describe("isSupportedFile", () => {
  it("accepts both AsciiDoc and Markdown extensions", () => {
    expect(isSupportedFile("a.md")).toBe(true);
    expect(isSupportedFile("b.adoc")).toBe(true);
    expect(isSupportedFile("c.txt")).toBe(false);
  });
});

describe("fileKind", () => {
  it.each([...ADOC_EXTENSIONS, ...MD_EXTENSIONS])(
    "classifies %s as document",
    (ext) => {
      // Mutation: routing a .md/.adoc through the media viewer would
      // bypass the editor/preview pipeline entirely.
      expect(fileKind(`doc${ext}`)).toBe("document");
    },
  );

  it.each(IMAGE_EXTENSIONS)("classifies %s as image", (ext) => {
    expect(fileKind(`photo${ext}`)).toBe("image");
  });

  it.each(PDF_EXTENSIONS)("classifies %s as pdf", (ext) => {
    expect(fileKind(`report${ext}`)).toBe("pdf");
  });

  it("treats unknown/text extensions as other", () => {
    // Mutation: returning "document" for .txt would force a useless
    // markdown conversion; "image" would route binary into <img>.
    expect(fileKind("notes.txt")).toBe("other");
    expect(fileKind("config.json")).toBe("other");
    expect(fileKind("data.yaml")).toBe("other");
    expect(fileKind("README")).toBe("other");
  });

  it("matches case-insensitively", () => {
    // Mutation: dropping toLowerCase() would misroute Photo.PNG to "other".
    expect(fileKind("Photo.PNG")).toBe("image");
    expect(fileKind("DOC.MD")).toBe("document");
    expect(fileKind("Report.PDF")).toBe("pdf");
  });

  it("classifies by suffix so directory paths work", () => {
    expect(fileKind("/abs/path/diagram.svg")).toBe("image");
    expect(fileKind("a/b/c/manual.pdf")).toBe("pdf");
  });
});

describe("fileManagerKind", () => {
  it("maps macOS user agents to Finder", () => {
    // Mutation: dropping the Mac branch would label the macOS menu item
    // "Open in File Manager" instead of "Reveal in Finder".
    expect(fileManagerKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("finder");
  });

  it("maps Windows user agents to Explorer", () => {
    expect(fileManagerKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("explorer");
  });

  it("falls back to a generic file manager on Linux/other", () => {
    expect(fileManagerKind("Mozilla/5.0 (X11; Linux x86_64)")).toBe("file-manager");
    expect(fileManagerKind("")).toBe("file-manager");
  });
});

describe("escapeHtml", () => {
  it("escapes the four characters that break HTML attribute and tag context", () => {
    expect(escapeHtml('<a href="x">&"</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&quot;&lt;/a&gt;",
    );
  });

  it("must escape & before other entities so &lt; doesn't become &amp;lt;", () => {
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("returns input unchanged when no special chars are present", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });
});

describe("cn", () => {
  it("merges and dedupes tailwind classes via tailwind-merge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar");
  });
});

describe("IGNORED_DIRS", () => {
  it("contains the standard noisy build/cache directories", () => {
    for (const dir of ["node_modules", ".git", "dist", "target", "coverage"]) {
      expect(IGNORED_DIRS.has(dir)).toBe(true);
    }
  });
});
