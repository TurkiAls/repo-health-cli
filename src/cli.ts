#!/usr/bin/env node
import { Command } from "commander";
import { scanRepository } from "./scanner.js";
import { renderJson } from "./reporters/json.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { renderText } from "./reporters/text.js";

const program = new Command();

program
  .name("repo-health")
  .description("Audit a repository for open-source readiness and maintainer quality.")
  .version("0.1.0");

program
  .command("scan")
  .argument("[path]", "Repository path to scan", ".")
  .option("--json", "Print JSON output")
  .option("--markdown", "Print Markdown output")
  .description("Scan a local repository")
  .action(async (targetPath: string, options: { json?: boolean; markdown?: boolean }) => {
    const report = await scanRepository({ root: targetPath });

    if (options.json) {
      process.stdout.write(renderJson(report));
      return;
    }

    if (options.markdown) {
      process.stdout.write(renderMarkdown(report));
      return;
    }

    process.stdout.write(renderText(report));
  });

await program.parseAsync(process.argv);
