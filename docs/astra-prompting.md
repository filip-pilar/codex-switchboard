# GPT-6 Astra prompting decisions

Official source fetched through OpenAI Docs during repository preparation:
[Using GPT-6 Astra — Prompting best practices](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices).
The fetched page explicitly identified GPT-6 Astra. This moving URL can change; verify the named model before applying future updates.

Applied to root instructions, the implementation plan, and kickoff prompt:

- State the deliverable and completion evidence; encourage follow-through on authorized work and reasonable routine decisions.
- Ask only for consequential missing information; finish independent preparation before user-dependent actions.
- Audit instruction conflicts and keep upstream source guidance distinct from this project's requirements.
- Specify concise milestone communication and maintain task continuity across steering and long sessions.
- Calibrate checks to the actual change; avoid unnecessary test expansion or repeated successful checks.
- Do not mandate delegation volume; use the host's applicable delegation policy.

This is prompting customization, not an API/model migration. It does not change global reasoning defaults, enable new API features, or claim OpenAI API capabilities automatically exist through Devin. The detailed product architecture is our design; it is not prescribed or validated by OpenAI's prompting guide.
