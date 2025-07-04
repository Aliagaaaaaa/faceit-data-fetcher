-- Create table to cache top 500 SA global rankings
CREATE TABLE IF NOT EXISTS global_ranking (
  rank INTEGER PRIMARY KEY,
  data TEXT
); 