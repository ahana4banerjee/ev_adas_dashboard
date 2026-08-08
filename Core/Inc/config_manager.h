/**
 * @file    config_manager.h
 * @brief   Non-Volatile Configuration Manager interface
 */

#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include "common.h"
#include "adas.h"

#define CONFIG_MAGIC        0x45564346U  /* "EVCF" (EV Config Frame) */
#define CONFIG_VERSION      1U

typedef struct __attribute__((aligned(4))) {
    uint32_t magic;                 /* Validation signature (0x45564346)       */
    uint32_t version;               /* Schema revision                          */
    float    fcw_warn_cm;           /* Forward collision warning distance (cm)  */
    float    fcw_crit_cm;           /* Forward collision critical distance (cm) */
    float    ttc_warn_s;            /* Time-to-Collision warning threshold (s)  */
    float    ttc_crit_s;            /* Time-to-Collision critical threshold (s) */
    float    bsd_dist_cm;           /* Blind spot detection range (cm)          */
    float    bsd_speed_kmh;         /* Blind spot vehicle speed gate (km/h)     */
    float    overspeed_kmh;         /* Overspeed advisory speed limit (km/h)    */
    uint16_t buzzer_advisory_freq;  /* Advisory alert tone frequency (Hz)       */
    uint16_t buzzer_critical_freq;  /* Critical alarm tone frequency (Hz)       */
    uint32_t checksum;              /* Simple parity/CRC verification           */
} Config_t;

/**
 * @brief  Initialize configuration manager and load parameters from Flash NVM.
 */
void Config_Init(void);

/**
 * @brief  Get read-only pointer to active system configuration.
 * @return Pointer to active Config_t structure
 */
const Config_t* Config_Get(void);

/**
 * @brief  Commit current active configuration to Flash NVM.
 * @return 1 on success, 0 on failure
 */
uint8_t Config_Save(void);

/**
 * @brief  Update a named parameter and persist change to Flash NVM.
 * @param  name  Parameter name (e.g. "fcw_warn", "fcw_crit", "ttc_warn", etc.)
 * @param  value New numeric value
 * @param  adas  Pointer to ADAS handle to sync runtime registers
 * @return 1 on success, 0 on failure
 */
uint8_t Config_SetParam(const char *name, float value, ADAS_HandleTypeDef *adas);

/**
 * @brief  Restore factory default parameters and write to Flash NVM.
 * @param  adas  Pointer to ADAS handle to sync runtime registers
 */
void Config_ResetDefaults(ADAS_HandleTypeDef *adas);

/**
 * @brief  Print all current configuration parameters over UART.
 */
void Config_Print(void);

#endif /* CONFIG_MANAGER_H */
