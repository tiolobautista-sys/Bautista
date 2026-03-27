import { createClient } from '@supabase/supabase-js'

// Replace with your actual values
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Create connection
export const supabase = createClient(supabaseUrl, supabaseKey)
