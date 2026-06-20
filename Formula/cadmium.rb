class Cadmium < Formula
  desc "Read-only analysis of Adobe Tags (Launch) properties from the CLI"
  homepage "https://github.com/tyssejc/adobe-tags-skill"
  license "MIT"
  head "https://github.com/tyssejc/adobe-tags-skill.git", branch: "main"

  # HEAD-only until the first release is cut. When you tag one on GitHub, add a
  # stable build ABOVE `license` (Homebrew requires url/sha256 before license):
  #   url "https://github.com/tyssejc/adobe-tags-skill/archive/refs/tags/v0.1.0.tar.gz"
  #   sha256 "<output of: shasum -a 256 on that tarball>"
  # Do NOT set `version` explicitly — Homebrew scans it from the URL.

  # Bun is in homebrew-core. If `brew install` fails to resolve this at build
  # time, fall back to the tap form: "oven-sh/bun/bun".
  depends_on "bun" => :build

  def install
    system "bun", "install", "--frozen-lockfile"
    system "bun", "build", "./bin/cadmium.ts", "--compile", "--outfile", "cadmium"
    bin.install "cadmium"
  end

  def caveats
    <<~EOS
      To enable the adobe-tags skill in Claude Code, run:
        cadmium skill install
    EOS
  end

  test do
    assert_match(/\d+\.\d+\.\d+/, shell_output("#{bin}/cadmium version"))
    system bin/"cadmium", "--help"
  end
end
