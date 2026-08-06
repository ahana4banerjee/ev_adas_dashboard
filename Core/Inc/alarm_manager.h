/**
 * @file    alarm_manager.h
 * @brief   Audible alarm priority manager interface
 * @platform STM32F103C8T6
 */

#ifndef ALARM_MANAGER_H
#define ALARM_MANAGER_H

#include "common.h"
#include "adas.h"

/* ─── Alarm Alert Sources ────────────────────────────────────────────────── */
typedef enum {
    ALERT_FAULT,       /* Critical System Faults (OT, Low SOC, Col Fault) */
    ALERT_FCW,         /* Forward Collision Warnings (Warn / Critical)   */
    ALERT_BSD_L,       /* Left Blind Spot Detection alerts               */
    ALERT_BSD_R,       /* Right Blind Spot Detection alerts              */
    ALERT_OVERSPEED,   /* Overspeed Advisory Alerts                      */
    ALERT_COUNT        /* Queue boundary count                           */
} AlertSource_t;

/* ─── API Prototypes ─────────────────────────────────────────────────────── */

/**
 * @brief  Initialize the alarm manager alerts registry.
 */
void AlarmManager_Init(void);

/**
 * @brief  Set/assert an active alert level for a specific source.
 * @param  source  The AlertSource_t enumeration key
 * @param  level   The target AlarmLevel_t priority
 */
void AlarmManager_SetAlert(AlertSource_t source, AlarmLevel_t level);

/**
 * @brief  Clear an active alert from the priority queue.
 * @param  source  The AlertSource_t key to clear
 */
void AlarmManager_ClearAlert(AlertSource_t source);

/**
 * @brief  Scan active alerts, resolve precedence, and configure the buzzer output.
 */
void AlarmManager_Update(void);

#endif /* ALARM_MANAGER_H */
