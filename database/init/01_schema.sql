CREATE TABLE IF NOT EXISTS sensor_readings (
    id BIGSERIAL PRIMARY KEY,
    tank_code VARCHAR(20) NOT NULL,
    remaining_tons NUMERIC(10,4) NOT NULL,
    valve_open BOOLEAN NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_tank_time ON sensor_readings(tank_code, recorded_at);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_recorded_at ON sensor_readings(recorded_at);

CREATE TABLE IF NOT EXISTS usage_segments (
    id BIGSERIAL PRIMARY KEY,
    tank_code VARCHAR(20) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    start_tons NUMERIC(10,4) NOT NULL,
    end_tons NUMERIC(10,4) NOT NULL,
    consumed_tons NUMERIC(10,4) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    merge_count INTEGER DEFAULT 0,
    start_reading_id BIGINT,
    end_reading_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (start_reading_id) REFERENCES sensor_readings(id) ON DELETE SET NULL,
    FOREIGN KEY (end_reading_id) REFERENCES sensor_readings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_segments_tank_time ON usage_segments(tank_code, start_time);
CREATE INDEX IF NOT EXISTS idx_usage_segments_start_time ON usage_segments(start_time);

CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    tank_code VARCHAR(20),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    detail JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_type_time ON alerts(alert_type, start_time);

CREATE TABLE IF NOT EXISTS processing_markers (
    id BIGSERIAL PRIMARY KEY,
    last_processed_reading_id BIGINT DEFAULT 0,
    last_processed_segment_id BIGINT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO processing_markers (last_processed_reading_id, last_processed_segment_id)
SELECT 0, 0 WHERE NOT EXISTS (SELECT 1 FROM processing_markers);
