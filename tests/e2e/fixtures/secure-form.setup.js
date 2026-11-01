// External module (served same-origin) so it runs under the server's strict
// `script-src 'self'` CSP. An inline <script> here is blocked by that CSP, which
// left the components unregistered and every form-interaction test timing out.
import '/latest/components/secure-form/secure-form.js';
import '/latest/components/secure-input/secure-input.js';
import '/latest/components/secure-submit-button/secure-submit-button.js';

// No blanket cancelSubmission here. formData is intentionally NOT in the
// secure-form-submit event detail (security: no sensitive data on a bubbling,
// composed event), so a test that needs to verify submitted values inspects the
// POST body — which requires the submission to proceed to fetch. The action URL
// (/api/test-submit) is mocked by each test, and tests that want to inspect the
// event instead add their own one-shot cancelling listener.
