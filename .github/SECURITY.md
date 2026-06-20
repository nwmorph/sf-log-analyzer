# Security Policy

**Reporting a vulnerability**

Do not open public GitHub issues for security concerns. Reach out directly to [@nwmorph](https://github.com/nwmorph) and include reproduction steps and potential impact.

**Scope**

The extension operates entirely locally. It communicates only with:
- Your local workspace filesystem — to read Apex source files and `.flow-meta.xml` metadata
- Your local `~/.sfdx` credentials store — to resolve the authenticated org URL
- Your Salesforce org instance URL — to construct links (opened in your browser on request)

No log data, source code, or credentials are sent to any third-party service. The optional `sf code-analyzer run` command is executed as a local CLI process using your existing Salesforce CLI installation.
