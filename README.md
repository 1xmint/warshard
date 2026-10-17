# Keel

Help coding agents turn a nontechnical user's vision into working software through sound engineering judgment, coherent context, and adaptive execution. Keel is a working name, drawn from the structure that keeps a vessel stable and on course.

Keel aims to be an adaptive engineering partner with the execution capacity of a coordinated team, accessible through an ordinary conversation. The user describes an outcome; the agent takes responsibility for understanding it, organizing the engineering effort, and carrying the work through implementation, verification, and recovery. The user should be able to focus on shaping and trying the software rather than directing agents, choosing workflows, curating context, or supervising technical details.

Coding agents provide powerful capabilities that a knowledgeable developer can direct and assess. Keel aims to make those capabilities work together for users who cannot be expected to know which technical questions to ask, which tools to invoke, or when an apparently successful result is incomplete. It should make engineering decisions itself, ask for consequential user judgments when needed, and preserve the user's intent throughout the work.

The product should support both starting a new project with an appropriate development foundation and improving an existing project without disrupting its working behavior. It should help an agent identify consequential repository problems, explain their effect, and make bounded, verifiable improvements while preserving the user's intent.

Context selection and quality are central product responsibilities. Each action and delegated task should receive relevant, current evidence, requirements, constraints, and decisions, with assumptions and uncertainty made explicit. Context should be sufficient for the task without unnecessary load, and findings should retain their basis when passed between agents or sessions. The intended result is coherent reasoning and execution across the project; the best mechanisms and their actual benefit must be established through implementation and verification.

Keel should adapt how it uses the host's available reasoning, tools, research, specialized skills, and delegation. It should decide when to investigate, compare approaches, seek an independent review, work in parallel, integrate findings, or proceed directly. Where the host supports model-specific delegation within the user's configuration, Keel may use different models for different responsibilities. Specific model combinations, prompt chains, graphs, and orchestration patterns are candidate mechanisms, not fixed architecture. Coordination must justify its cost, latency, and risk of losing information, and should scale down when direct execution is sufficient.

The product aims for one easy installation, economical use of the user's existing subscription, and no manual subscription-tier configuration. Claude Code is the initial target; Codex and supported ChatGPT environments are additional targets whose compatibility must be established.

Provider authentication, billing, model availability and selection controls, permissions, and execution remain with the host. Keel should make effective use of supported native capabilities and add mechanisms where an implemented need justifies them.

These are product goals, not claims of implemented support or measured improvement.
