// Fill these in from Supabase dashboard: Project Settings > API
const SUPABASE_URL = "https://bkobrmfarfivxjzcpqbd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb2JybWZhcmZpdnhqemNwcWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNTkzMDIsImV4cCI6MjEwNDYzNTMwMn0.QLdTquI8qQvqPrt1NWLOEV2hL3p_cc5s2dAGLiad0xk";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
