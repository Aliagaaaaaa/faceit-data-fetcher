-- Create live_matches table to cache current Faceit live matches
CREATE TABLE IF NOT EXISTS live_matches (
    id TEXT PRIMARY KEY,
    data TEXT
); 