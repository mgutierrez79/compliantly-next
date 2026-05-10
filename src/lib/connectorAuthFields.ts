// Mapping from catalog auth-field keys (api_key, username, etc.)
// to the wizard's render shape. Centralising this means a new auth
// method only needs one descriptor entry to surface in the UI.
//
// Keys not in the map fall through to a sensible default (text
// input, label = humanised key). Adding a new descriptor is
// preferred so the hint copy can explain provider quirks.

export type AuthFieldDescriptor = {
  // Form label rendered above the input.
  label: string
  // Help text rendered below in muted color. Optional.
  hint?: string
  // 'password' renders an obscured input + masks the value in the
  // settings page after save. Anything else is plain text.
  type?: 'text' | 'password'
}

export const AUTH_FIELD_DESCRIPTORS: Record<string, AuthFieldDescriptor> = {
  api_key: {
    label: 'API key',
    type: 'password',
    hint: 'Generate from the connector vendor admin console.',
  },
  api_token: {
    label: 'API token',
    type: 'password',
  },
  token: {
    label: 'Token',
    type: 'password',
  },
  password: {
    label: 'Password',
    type: 'password',
  },
  username: {
    label: 'Username',
  },
  client_id: {
    label: 'OAuth client ID',
  },
  client_secret: {
    label: 'OAuth client secret',
    type: 'password',
  },
  app_token: {
    label: 'App token',
    type: 'password',
  },
  user_token: {
    label: 'User token',
    type: 'password',
  },
  access_key: {
    label: 'Access key ID',
  },
  secret_key: {
    label: 'Secret access key',
    type: 'password',
  },
  session_token: {
    label: 'Session token',
    type: 'password',
  },
  serial: {
    label: 'Serial number',
    hint: 'Used for HA-aware scoping.',
  },
}

export function describeAuthField(key: string): AuthFieldDescriptor {
  const known = AUTH_FIELD_DESCRIPTORS[key]
  if (known) return known
  // Fallback: humanise unknown_key → "Unknown key".
  const label = key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return { label }
}
