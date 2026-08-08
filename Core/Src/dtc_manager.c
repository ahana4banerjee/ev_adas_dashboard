/**
 * @file    dtc_manager.c
 * @brief   Diagnostic Trouble Code (DTC) and Freeze Frame registry implementation
 */

#include "dtc_manager.h"
#include <string.h>
#include <stdio.h>

extern UART_HandleTypeDef huart1;

/* ─── Private Variables ──────────────────────────────────────────────────── */
static DTC_Record_t dtc_records[DTC_MAX_RECORDS];
static uint32_t dtc_count = 0;

/* ─── API Implementations ────────────────────────────────────────────────── */

void DTC_Init(void)
{
    memset(dtc_records, 0, sizeof(dtc_records));
    dtc_count = 0;
}

const char* DTC_CodeToString(uint16_t code)
{
    switch (code) {
        case DTC_MOTOR_OVERHEAT:  return "P0A80";
        case DTC_BATTERY_LOW:     return "P0210";
        case DTC_COLLISION_LATCH: return "C1C00";
        case DTC_SENSOR_TIMEOUT:  return "C1A00";
        default:                  return "U0000";
    }
}

void DTC_Log(uint16_t code, const EV_HandleTypeDef *ev, const char *description)
{
    uint32_t primask = __get_PRIMASK();
    __disable_irq();

    /* Check if this DTC is already active to avoid duplicate freeze frames */
    for (uint32_t i = 0; i < dtc_count; i++) {
        if (dtc_records[i].dtc_code == code && dtc_records[i].active) {
            if (!primask) __enable_irq();
            return;
        }
    }

    uint32_t idx;
    if (dtc_count < DTC_MAX_RECORDS) {
        idx = dtc_count++;
    } else {
        /* Shift array left to discard the oldest entry */
        for (uint32_t i = 0; i < DTC_MAX_RECORDS - 1; i++) {
            dtc_records[i] = dtc_records[i + 1];
        }
        idx = DTC_MAX_RECORDS - 1;
    }

    dtc_records[idx].dtc_code     = code;
    dtc_records[idx].active       = 1;
    dtc_records[idx].timestamp    = HAL_GetTick();
    dtc_records[idx].speed_kmh    = ev ? ev->speed_kmh : 0.0f;
    dtc_records[idx].soc_pct      = ev ? ev->soc : 0.0f;
    dtc_records[idx].motor_temp_c = ev ? ev->motor_temp : 0.0f;
    dtc_records[idx].torque_nm    = ev ? ev->motor_torque : 0.0f;

    if (description) {
        strncpy(dtc_records[idx].description, description, sizeof(dtc_records[idx].description) - 1);
        dtc_records[idx].description[sizeof(dtc_records[idx].description) - 1] = '\0';
    } else {
        dtc_records[idx].description[0] = '\0';
    }

    if (!primask) __enable_irq();
}

const DTC_Record_t* DTC_GetRecords(uint32_t *count)
{
    if (count) *count = dtc_count;
    return dtc_records;
}

uint32_t DTC_GetActiveCount(void)
{
    uint32_t active = 0;
    for (uint32_t i = 0; i < dtc_count; i++) {
        if (dtc_records[i].active) active++;
    }
    return active;
}

void DTC_ClearAll(void)
{
    uint32_t primask = __get_PRIMASK();
    __disable_irq();

    memset(dtc_records, 0, sizeof(dtc_records));
    dtc_count = 0;

    if (!primask) __enable_irq();
}

void DTC_PrintAll(void)
{
    char buf[180];
    int len;

    len = sprintf(buf, "\r\n===== DIAGNOSTIC TROUBLE CODES (DTC) =====\r\n");
    HAL_UART_Transmit(&huart1, (uint8_t*)buf, len, 100);

    if (dtc_count == 0) {
        len = sprintf(buf, " No stored DTC fault records. System clean.\r\n");
        HAL_UART_Transmit(&huart1, (uint8_t*)buf, len, 100);
    } else {
        for (uint32_t i = 0; i < dtc_count; i++) {
            int spd  = (int)dtc_records[i].speed_kmh;
            int spdd = (int)(dtc_records[i].speed_kmh * 10.0f) % 10;
            int soc  = (int)dtc_records[i].soc_pct;
            int socd = (int)(dtc_records[i].soc_pct * 10.0f) % 10;
            int tmp  = (int)dtc_records[i].motor_temp_c;
            int tmpd = (int)(dtc_records[i].motor_temp_c * 10.0f) % 10;
            if (spdd < 0) spdd = -spdd;
            if (socd < 0) socd = -socd;
            if (tmpd < 0) tmpd = -tmpd;

            len = sprintf(buf, " [%u] Code: %s (0x%04X) | State: %s | Time: %lums\r\n"
                               "     FreezeFrame: Spd=%d.%dkm/h, SOC=%d.%d%%, Temp=%d.%dC\r\n"
                               "     Desc: %s\r\n",
                          (unsigned int)(i + 1),
                          DTC_CodeToString(dtc_records[i].dtc_code),
                          dtc_records[i].dtc_code,
                          dtc_records[i].active ? "ACTIVE" : "HISTORY",
                          (unsigned long)dtc_records[i].timestamp,
                          spd, spdd, soc, socd, tmp, tmpd,
                          dtc_records[i].description);
            HAL_UART_Transmit(&huart1, (uint8_t*)buf, len, 100);
        }
    }

    len = sprintf(buf, "==========================================\r\n> ");
    HAL_UART_Transmit(&huart1, (uint8_t*)buf, len, 100);
}
