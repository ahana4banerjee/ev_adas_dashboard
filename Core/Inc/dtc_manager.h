/**
 * @file    dtc_manager.h
 * @brief   Diagnostic Trouble Code (DTC) and Freeze Frame manager interface
 */

#ifndef DTC_MANAGER_H
#define DTC_MANAGER_H

#include "common.h"
#include "ev_control.h"

/* ─── Standard Automotive DTC Codes ──────────────────────────────────────── */
#define DTC_NONE            0x0000
#define DTC_MOTOR_OVERHEAT  0x0A80  /* P0A80: Motor/Battery pack overtemperature */
#define DTC_BATTERY_LOW     0x0210  /* P0210: Critical Low State-of-Charge       */
#define DTC_COLLISION_LATCH 0x1C00  /* C1C00: Severe Collision Emergency Stop    */
#define DTC_SENSOR_TIMEOUT  0x1A00  /* C1A00: Ultrasonic Echo Sensor Timeout     */

#define DTC_MAX_RECORDS     10

/* ─── Freeze Frame Record Definition ─────────────────────────────────────── */
typedef struct {
    uint16_t dtc_code;          /* 16-bit DTC hexadecimal identifier        */
    uint8_t  active;            /* 1 = Currently active, 0 = Historical     */
    uint32_t timestamp;         /* System timestamp in ms                   */
    float    speed_kmh;         /* Vehicle speed snapshot at fault moment   */
    float    soc_pct;           /* Battery SOC % snapshot                   */
    float    motor_temp_c;      /* Motor temperature snapshot               */
    float    torque_nm;         /* Motor torque snapshot                    */
    char     description[32];   /* Short description text                   */
} DTC_Record_t;

/* ─── API Prototypes ─────────────────────────────────────────────────────── */

/**
 * @brief  Initialize the DTC and Freeze Frame registry.
 */
void DTC_Init(void);

/**
 * @brief  Register a Diagnostic Trouble Code and capture a snapshot Freeze Frame.
 * @param  code        DTC identifier (e.g. DTC_MOTOR_OVERHEAT)
 * @param  ev          Pointer to current EV state structure to snapshot
 * @param  description Human-readable failure description
 */
void DTC_Log(uint16_t code, const EV_HandleTypeDef *ev, const char *description);

/**
 * @brief  Retrieve the list of active/historical DTC records.
 * @param  count  Output pointer to the number of stored records
 * @return Pointer to internal array of DTC records
 */
const DTC_Record_t* DTC_GetRecords(uint32_t *count);

/**
 * @brief  Get the count of currently active (unresolved) DTCs.
 * @return Number of active DTCs
 */
uint32_t DTC_GetActiveCount(void);

/**
 * @brief  Clear all historical and active DTC records.
 */
void DTC_ClearAll(void);

/**
 * @brief  Format and transmit all stored DTC records over UART.
 */
void DTC_PrintAll(void);

/**
 * @brief  Helper to convert DTC numeric code to standard OBD/UDS string (e.g., "P0A80").
 */
const char* DTC_CodeToString(uint16_t code);

#endif /* DTC_MANAGER_H */
