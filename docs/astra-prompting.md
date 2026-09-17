# GPT-6 Astra instruction decisions

Historical rationale for the September 12 instruction review. Repository guidance is now model-neutral; `AGENTS.md` owns the current rules.

Reviewed on 2026-09-12 against the complete OpenAI article [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra), published 2026-09-11. Earlier preparation used [Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices); that moving guide is provenance, not required reading for repository tasks.

## Repository decisions

- Root `AGENTS.md` owns shared workflow rules and routes context by task. The plan owns product requirements; status records evidence. Neither the original integration sequence nor a prior live-test budget starts new work automatically.
- Completion follows the authorized task: app changes require relevant runtime evidence, while instruction edits require consistency checks. Preserve independent progress when login or activation needs the user.
- Detailed routing, authentication, restoration, source reuse, and compatibility contracts remain useful project knowledge. They are retained rather than compressed into generic advice.
- No repository-owned skills, skill metadata/resources, agent model configuration, CI workflows, or automation definitions were found. No new skill layer is needed. Host-installed skills and archived upstream instructions are outside this repository's ownership.
- Development guidance targets Astra only. Product support for native models, Devin/Grok discovery, legacy selector rejection fixtures, and the reviewed Devin compatibility preamble remain unchanged. This audit is not a model/API migration or a speculative transport prompt experiment.

## Evidence and limits

Confirmed issues were unconditional kickoff reading, duplicated workflow authority, and initial-delivery language applying to maintenance tasks. The edits remove those conflicts. Whether they improve Astra's speed or persistence is a hypothesis; no comparative model evaluation or live inference was performed for this audit. Existing product test evidence is not evidence of instruction effectiveness.
