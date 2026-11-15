# Task: Comprehensive Logging Audit & Developer Observability System

Act as a senior software engineer specialising in application observability, logging infrastructure, debugging systems, and plugin architectures.

This Tauri application already has an existing logger module. However, it has not been comprehensively reviewed or updated recently.

Your task is to audit the existing logging infrastructure, identify missing logging coverage, improve the logger where necessary, and implement a more comprehensive Developer Log system for application maintainers and plugin developers.

Do not blindly replace the existing logger. First understand its architecture, current implementation, logging destinations, log levels, configuration, and integration throughout the application.

The goal is to establish reliable, structured, useful, and maintainable logging across the entire application.

---

# PART 1: Audit the Existing Logger

Start by locating and understanding the existing logger module.

Inspect:
- Logger implementation.
- Logging configuration.
- Logging levels.
- Log formatting.
- Log storage and persistence.
- Log rotation and retention.
- Frontend logging.
- Rust backend logging.
- Tauri command logging.
- Error logging.
- Plugin-related logging.
- Any existing log viewer or export functionality.

Search the entire codebase for:
- Existing logger calls.
- Console.log, console.warn, console.error.
- println!, eprintln!, and equivalent Rust debugging statements.
- Swallowed exceptions.
- Empty catch blocks.
- Error handlers that do not log failures.
- Important operations that currently execute without logging.

Identify inconsistencies and unnecessary duplicate logging.

Produce an internal audit before making changes.

# PART 2: Ensure All Major Application Events Are Logged

Review the entire application and ensure that all important operations generate appropriate log entries.

Cover the following categories.

### A. Application lifecycle
- Application startup.
- Application shutdown.
- Application initialization.
- Configuration loading.
- Configuration failures.
- Database initialization.
- Database connection failures.
- Application version and environment.
- Recovery from unexpected errors.

### B. Navigation and UI
- Major view transitions.
- Failed navigation operations.
- Dialog and modal lifecycle where relevant.
- Important user actions.
- Failed UI operations.
- State restoration failures.

Avoid logging every minor UI interaction. Focus on events that help diagnose application behaviour.

### C. Data operations
- Data creation.
- Data updates.
- Data deletion.
- Import and export.
- File operations.
- Database queries where operationally relevant.
- Validation failures.
- Data migration.
- Backup and restoration.

### D. Network and external operations
- API requests.
- API failures.
- Connection failures.
- Request timeouts.
- Retry attempts.
- External service communication.
- Authentication failures.

Never log passwords, authentication tokens, API keys, or sensitive request payloads.

### E. Background operations
- Background task initiation.
- Task completion.
- Task failures.
- Scheduling.
- Cancellation.
- Retry attempts.
- Execution duration.

### F. Plugin system

Give particular attention to plugin-related operations.

Log:
- Plugin discovery.
- Plugin loading.
- Plugin initialization.
- Plugin activation and deactivation.
- Plugin installation and removal.
- Plugin version information.
- Plugin compatibility checks.
- Plugin permission checks.
- Plugin API calls.
- Plugin-to-application communication.
- Plugin errors and exceptions.
- Plugin lifecycle failures.
- Plugin execution duration where measurable.

Whenever possible, identify which plugin generated the event.

### G. Security and permissions
- Permission requests.
- Permission denials.
- Capability failures.
- Invalid plugin operations.
- Unexpected access attempts.

Do not expose sensitive security information in ordinary logs.

# PART 3: Introduce Structured Logging

Improve the existing logger to support structured log entries.

Where appropriate, each entry should contain:

- Timestamp.
- Log level.
- Category.
- Event name.
- Human-readable message.
- Source module.
- Component or subsystem.
- Execution context.
- Correlation ID or operation ID.
- Plugin ID, when applicable.
- Error details, when applicable.
- Execution duration, when relevant.

Use a consistent schema across frontend and Rust backend logging.

Suggested levels:

TRACE: Extremely detailed execution-level information.

DEBUG: Diagnostic information for developers.

INFO: Important application events and successful operations.

WARN: Unexpected situations that do not necessarily prevent operation.

ERROR: Failed operations and recoverable errors.

FATAL: Critical failures that prevent normal application operation.

Ensure logging levels are used consistently.

Avoid logging the same exception repeatedly at multiple layers unless each entry adds meaningful context.

# PART 4: Build a Dedicated Developer Log System

This is a major requirement.

I want a much deeper logging system specifically for:

1. Application maintainers.
2. Internal developers.
3. Plugin developers.

This should complement the existing application logger rather than create an unrelated logging infrastructure.

### Developer logging should capture:

**Execution flow**
- Function or operation entry and exit where useful.
- Important internal state transitions.
- Execution paths.
- Failed operations.
- Unexpected conditions.
- Execution duration.

**Internal application events**
- Event dispatching.
- Event listeners.
- Internal communication.
- State changes.
- Service initialization.
- Component interactions.
- Backend/frontend communication.

**Plugin diagnostics**
- Plugin lifecycle events.
- Plugin API invocations.
- Plugin communication.
- Plugin initialization sequence.
- Plugin failures.
- Permission checks.
- Plugin execution timing.
- Compatibility and dependency issues.

**Performance diagnostics**
- Slow operations.
- Long-running tasks.
- API response duration.
- Database operation duration where useful.
- Background task duration.
- Startup duration.
- Memory or resource information where safely available.

Do not instrument every function indiscriminately. Prioritise meaningful execution boundaries and operations that developers may need to diagnose.

# PART 5: Developer Log Viewer

Inspect whether an existing log viewer can accommodate developer logs.

If appropriate, extend it. Otherwise, implement a dedicated Developer Log section.

The interface should provide:

### Filtering
- Log level.
- Category.
- Module.
- Source.
- Plugin ID.
- Event type.
- Time range.
- Search by keyword.
- Correlation ID.

### Viewing
- Human-readable log messages.
- Expandable detailed log entries.
- Full error details.
- Stack traces where available.
- Timestamps.
- Execution duration.
- Related event information.

### Developer tools
- Enable and disable developer logging.
- Configure verbosity.
- Clear logs with confirmation.
- Export logs.
- Copy individual entries.
- Copy diagnostic information.
- Pause and resume live log updates.
- Search and filter large log collections.

The interface should remain responsive with large log volumes.

Use pagination, virtualisation, or another suitable approach rather than rendering unlimited entries simultaneously.

Keep the developer interface visually consistent with the rest of the application.

# PART 6: Plugin Developer Support

Plugin developers should be able to understand what their plugin is doing without requiring access to the application's entire internal logging stream.

Where the architecture permits, introduce:

- Plugin-specific log filtering.
- Plugin-specific diagnostic context.
- Plugin lifecycle visibility.
- Plugin API call history.
- Plugin execution errors.
- Plugin compatibility warnings.
- Clear identification of application-generated versus plugin-generated events.

If plugins have access to a logging API, review and improve it.

Provide a documented logging interface with appropriate log levels and structured context.

Plugin logging must not allow plugins to overwrite, delete, or access unrestricted private application logs.

Keep plugin permissions and isolation intact.

# PART 7: Logging Configuration and Performance

Logging should be useful without negatively affecting application performance.

Review and implement where appropriate:

- Configurable log levels.
- Separate verbosity settings for application and developer logs.
- Persistent log storage.
- Log rotation.
- Configurable retention.
- Asynchronous writing where appropriate.
- Bounded log buffers.
- Protection against excessive logging.
- Graceful handling of logging failures.
- Development versus production logging configuration.

Developer-level verbose logging should be configurable and should not unnecessarily burden normal production usage.

Do not silently discard important errors when developer logging is disabled.

The standard application logger must continue recording important operational errors.

# PART 8: Privacy and Security

This is mandatory.

Ensure that logs never expose:
- Passwords.
- API keys.
- Authentication tokens.
- Session secrets.
- Sensitive personal information.
- Private file contents.
- Sensitive plugin data.

Introduce redaction where appropriate.

Review logging of HTTP headers, request bodies, environment variables, database values, and plugin payloads.

Ensure exported diagnostic logs are safe to share by default, with appropriate warnings and redaction.

# PART 9: Testing and Verification

Do not simply add logger calls and assume logging works.

Verify the complete logging pipeline.

Test:
1. Application startup and shutdown.
2. Successful and failed database operations.
3. Successful and failed API calls.
4. File operations.
5. Plugin loading and unloading.
6. Plugin API calls.
7. Plugin failures.
8. Frontend-to-backend communication.
9. Error handling.
10. Log persistence.
11. Log rotation.
12. Log export.
13. Log filtering.
14. Developer logging enable/disable.
15. Behaviour when log storage is unavailable.

Verify that important events are actually written to the correct log destination.

Check that disabling developer verbosity does not disable important operational logging.

Run the existing test suite, linting, type checking, and production build.

# PART 10: Documentation

Update or create developer documentation explaining:

- Logging architecture.
- Log levels and their intended usage.
- Logging API.
- How to add new log events.
- How to enable developer logging.
- Where logs are stored.
- How log rotation works.
- How to inspect and export logs.
- How plugin developers can access logging functionality.
- Security and redaction rules.
- Troubleshooting common logging issues.

Include practical code examples for application developers and plugin developers.

# PART 11: Final Audit Report

Provide a report containing:

1. Existing logging infrastructure discovered.
2. Missing logging coverage identified.
3. Major application events instrumented.
4. Developer logging functionality implemented.
5. Plugin developer improvements.
6. UI changes.
7. Security and privacy improvements.
8. Storage and performance improvements.
9. Tests performed and their results.
10. Known limitations and remaining work.

For each major improvement, identify the relevant files.

Clearly distinguish between functionality implemented, functionality tested, and functionality that remains incomplete.

---

# Important Implementation Rules

- Understand the existing architecture before modifying anything.
- Reuse the existing logger wherever practical.
- Avoid introducing duplicate logging systems.
- Maintain consistent structured logging across Rust and frontend code.
- Do not introduce unnecessary dependencies.
- Preserve backward compatibility with existing plugins wherever possible.
- Do not weaken Tauri security permissions.
- Do not log sensitive data.
- Do not replace real functionality with mock implementations.
- Do not remove existing logging functionality without a clear reason.
- Do not consider the task complete until the logging pipeline has been tested.

**Final objective:** Establish a reliable application-wide logging system for normal operations and a substantially more detailed diagnostic system for maintainers and plugin developers, making it possible to investigate application behaviour, reproduce failures, identify plugin problems, and diagnose issues without relying on guesswork.