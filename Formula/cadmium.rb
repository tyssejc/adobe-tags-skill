class Cadmium < Formula
  desc "Read-only analysis of Adobe Tags (Launch) properties from the CLI"
  homepage "https://github.com/tyssejc/adobe-tags-skill"
  license "MIT"

  # Stable release path — fill in when the first tagged tarball is published.
  url "https://github.com/tyssejc/adobe-tags-skill/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_RELEASE_SHA256"
  version "0.1.0"

  head "https://github.com/tyssejc/adobe-tags-skill.git", branch: "main"

  # Bun is in homebrew-core. If `brew install --HEAD` fails to resolve this at
  # build time, fall back to the tap form: "oven-sh/bun/bun".
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
    assert_match version.to_s, shell_output("#{bin}/cadmium version")
    system bin/"cadmium", "--help"
  end
end
