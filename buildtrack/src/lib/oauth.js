import { supabase } from './supabase'

// Starts Google/Apple sign-in. Supabase redirects the whole page to the provider
// and brings the user back to the site root with the session tokens in the URL;
// main.jsx forwards that return visit to /app.
export async function signInWithProvider(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider, options: { redirectTo: window.location.origin },
  })
  return { error }
}

// Apple sign-in needs a paid Apple Developer account and the provider enabled in
// Supabase. The button stays hidden until VITE_APPLE_SIGNIN=true is set.
export const APPLE_SIGNIN_ENABLED = import.meta.env.VITE_APPLE_SIGNIN === 'true'
