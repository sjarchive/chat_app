// Fill these in from Supabase dashboard: Project Settings > API
const SUPABASE_URL = "https://bkobrmfarfivxjzcpqbd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb2JybWZhcmZpdnhqemNwcWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNTkzMDIsImV4cCI6MjEwNDYzNTMwMn0.QLdTquI8qQvqPrt1NWLOEV2hL3p_cc5s2dAGLiad0xk";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Public VAPID key — safe to expose in client code, this is the "public" half.
const VAPID_PUBLIC_KEY = "BBRZwlWQ4I0lqTwM4ZnmuXLg8B8V76XqnOVA9_pQE4jwI77OhACA6hKVXN8sj-mmfWpLmmdrbHaZM1hMDJssyqk";
