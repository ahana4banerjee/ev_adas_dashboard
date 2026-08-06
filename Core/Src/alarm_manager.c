/**
 * @file    alarm_manager.c
 * @brief   Audible alarm priority manager implementation
 */

#include "alarm_manager.h"
#include "buzzer.h"

/* ─── Private Variables ──────────────────────────────────────────────────── */
static AlarmLevel_t active_alerts[ALERT_COUNT];

/* ─── API Implementations ────────────────────────────────────────────────── */

void AlarmManager_Init(void)
{
    for (int i = 0; i < ALERT_COUNT; i++) {
        active_alerts[i] = ALARM_NONE;
    }
}

void AlarmManager_SetAlert(AlertSource_t source, AlarmLevel_t level)
{
    if (source < ALERT_COUNT) {
        active_alerts[source] = level;
    }
}

void AlarmManager_ClearAlert(AlertSource_t source)
{
    if (source < ALERT_COUNT) {
        active_alerts[source] = ALARM_NONE;
    }
}

void AlarmManager_Update(void)
{
    AlarmLevel_t highest_level = ALARM_NONE;

    /* Scan in priority order: Fault > FCW > BSD Left > BSD Right > Overspeed */
    if (active_alerts[ALERT_FAULT] != ALARM_NONE) {
        highest_level = active_alerts[ALERT_FAULT];
    } else if (active_alerts[ALERT_FCW] != ALARM_NONE) {
        highest_level = active_alerts[ALERT_FCW];
    } else if (active_alerts[ALERT_BSD_L] != ALARM_NONE) {
        highest_level = active_alerts[ALERT_BSD_L];
    } else if (active_alerts[ALERT_BSD_R] != ALARM_NONE) {
        highest_level = active_alerts[ALERT_BSD_R];
    } else if (active_alerts[ALERT_OVERSPEED] != ALARM_NONE) {
        highest_level = active_alerts[ALERT_OVERSPEED];
    }

    /* Drive the buzzer driver state machine with resolved priority */
    Buzzer_SetAlarmLevel(highest_level);
}
