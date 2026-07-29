# gallery-browse — Delta Specification

## ADDED Requirements

### Requirement: Special-day labels only on the wedding dates

Day headers SHALL carry the wedding-weekend decorations only for photos taken on 2026-07-09 (White Dinner Day), 2026-07-10 (Wedding Day), and 2026-07-11 (Pool Day), evaluated as calendar dates in the event timezone. Headers for any other date SHALL render undecorated.

#### Scenario: Wedding weekend decorated

- **WHEN** the grid shows a day group for 2026-07-10 (event timezone)
- **THEN** its header includes the "💍 Wedding Day" decoration

#### Scenario: Later same-weekday dates are plain

- **WHEN** the grid shows a day group for a different Thursday, Friday, or Saturday (e.g. 2026-07-23)
- **THEN** its header shows only the formatted date with no decoration
