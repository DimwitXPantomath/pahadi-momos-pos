import { createClient } from "@supabase/supabase-js";

console.log("SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL="https://xvdagtgqvrqdqhpsfbtt.supabase.co" as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZGFndGdxdnJxZHFocHNmYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTE3NjksImV4cCI6MjA4NDQyNzc2OX0.rUNTOdmdVPQ4nmVtqodPfsKNkxvjhyo3uJOTPXONEeo" as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);