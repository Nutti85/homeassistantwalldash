# WallDash camera-event glossary

- **Frigate review:** A completed Frigate review with a stable review ID, start time, camera, severity, detected objects, and optional zones.
- **Camera event group:** Qualifying reviews from the same camera and zone whose start times fit within the ten-minute grouping window. The group exposes the newest review first and unions its relevant object labels.
- **Monitoring interval:** A period derived from Home Assistant `input_number.toggle_security_mode` history. Reviews starting in mode `1` (armed) or `2` (notifications) qualify; mode `3` does not.
- **Confirmed review:** A Frigate review received through the REST feed after completion. MQTT `frigate/reviews` `end` messages only invalidate the dashboard cache through a payload-free same-origin SSE event.
