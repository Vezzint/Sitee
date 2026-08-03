import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kmtavikvqexfdzlnhuil.supabase.co'
const supabaseKey = 'sb_publishable_Os9msPkOqpnKxazWmy1n2A_IBxZuHxr'

export const supabase = createClient(supabaseUrl, supabaseKey)
