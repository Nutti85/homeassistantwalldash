# Jacob homework in Hendelser

## Goal

Show each dated Jacob homework item in **Hendelser** from Monday through its due date, and let the wall display mark it complete.

## Scope

- Homework due during the current Monday–Sunday week is displayed on each day from Monday to its due date.
- A homework item is identified from its stable school-plan fields and is hidden once marked complete on this device.
- The existing agenda detail modal offers **Ferdig** for homework items; pressing it removes the item from Hendelser and persists that choice locally.

## Non-goals

- Do not alter Zokrates/Home Assistant source data.
- Do not change calendar events, reminders, or homework outside the current due week.

## Acceptance criteria

- On Monday, homework due Friday is visible in Hendelser; it remains visible Tuesday through Friday.
- It is not displayed after Friday and does not appear before the due week.
- Clicking a displayed homework opens its modal, where **Ferdig** removes it immediately and keeps it hidden after a refresh.
