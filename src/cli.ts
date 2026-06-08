#!/usr/bin/env node
import { Command } from "commander";
import { scanRepository } from "./scanner.js";
import { renderJson } from "./reporters/json.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { renderSarif } from "./reporters/sarif.js";
import { renderText } from "./reporters/text.js";

const program = new Command();

program
  .name("repo-health")
  .description("Audit a repository for open-source readiness and maintainer quality.")
  .version("0.2.0");

program
  .command("scan")
  .argument("[path]", "Repository path to scan", ".")
  .option("--json", "Print JSON output")
  .option("--markdown", "Print Markdown output")
  .option("--sarif", "Print SARIF 2.1.0 output")
  .option("--config <path>", "Path to repo-health config file")
  .description("Scan a local repository")
  .action(async (targetPath: string, options: { json?: boolean; markdown?: boolean; sarif?: boolean; config?: string }) => {
    const report = await scanRepository({ root: targetPath, configPath: options.config });

    if (options.json) {
      process.stdout.write(renderJson(report));
      return;
    }

    if (options.markdown) {
      process.stdout.write(renderMarkdown(report));
      return;
    }

    if (options.sarif) {
      process.stdout.write(renderSarif(report));
      return;
    }

    process.stdout.write(renderText(report));
  });

await program.parseAsync(process.argv);
