/**
 * @file    config_manager.c
 * @brief   Non-Volatile Configuration Manager implementation
 */

#include "config_manager.h"
#include "dal_flash.h"
#include "dal_uart.h"
#include <string.h>
#include <stdio.h>

/* ─── Factory Default Configuration ──────────────────────────────────────── */
static const Config_t FACTORY_DEFAULTS = {
    .magic                = CONFIG_MAGIC,
    .version              = CONFIG_VERSION,
    .fcw_warn_cm          = 50.0f,
    .fcw_crit_cm          = 20.0f,
    .ttc_warn_s           = 3.0f,
    .ttc_crit_s           = 1.5f,
    .bsd_dist_cm          = 30.0f,
    .bsd_speed_kmh        = 20.0f,
    .overspeed_kmh        = 120.0f,
    .buzzer_advisory_freq = 1200,
    .buzzer_critical_freq = 2500,
    .checksum             = 0
};

static Config_t active_config;

/* ─── Private Helper: Calculate Checksum ─────────────────────────────────── */
static uint32_t calculate_checksum(const Config_t *cfg)
{
    const uint8_t *bytes = (const uint8_t*)cfg;
    uint32_t sum = 0;
    /* Sum all bytes excluding the checksum field itself */
    for (size_t i = 0; i < sizeof(Config_t) - sizeof(uint32_t); i++) {
        sum += bytes[i];
    }
    return sum;
}

/* ─── API Implementations ────────────────────────────────────────────────── */

void Config_Init(void)
{
    Config_t stored_cfg;
    uint32_t word_count = sizeof(Config_t) / sizeof(uint32_t);

    /* Read flash page */
    DAL_Flash_Read(DAL_FLASH_CONFIG_PAGE_ADDR, (uint32_t*)&stored_cfg, word_count);

    /* Verify signature and checksum */
    if (stored_cfg.magic == CONFIG_MAGIC &&
        stored_cfg.version == CONFIG_VERSION &&
        stored_cfg.checksum == calculate_checksum(&stored_cfg)) {
        /* Valid configuration loaded from Flash NVM */
        memcpy(&active_config, &stored_cfg, sizeof(Config_t));
    } else {
        /* Unprogrammed flash or corrupted: load and save factory defaults */
        memcpy(&active_config, &FACTORY_DEFAULTS, sizeof(Config_t));
        active_config.checksum = calculate_checksum(&active_config);
        Config_Save();
    }
}

const Config_t* Config_Get(void)
{
    return &active_config;
}

uint8_t Config_Save(void)
{
    active_config.magic    = CONFIG_MAGIC;
    active_config.version  = CONFIG_VERSION;
    active_config.checksum = calculate_checksum(&active_config);

    uint32_t word_count = sizeof(Config_t) / sizeof(uint32_t);

    if (!DAL_Flash_ErasePage(DAL_FLASH_CONFIG_PAGE_ADDR)) {
        return 0;
    }

    return DAL_Flash_Write(DAL_FLASH_CONFIG_PAGE_ADDR, (const uint32_t*)&active_config, word_count);
}

uint8_t Config_SetParam(const char *name, float value, ADAS_HandleTypeDef *adas)
{
    uint8_t changed = 0;

    if (!strcasecmp(name, "fcw_warn")) {
        active_config.fcw_warn_cm = value;
        if (adas) adas->fcw_warn_cm = value;
        changed = 1;
    } else if (!strcasecmp(name, "fcw_crit")) {
        active_config.fcw_crit_cm = value;
        if (adas) adas->fcw_crit_cm = value;
        changed = 1;
    } else if (!strcasecmp(name, "ttc_warn")) {
        active_config.ttc_warn_s = value;
        if (adas) adas->ttc_warn_s = value;
        changed = 1;
    } else if (!strcasecmp(name, "ttc_crit")) {
        active_config.ttc_crit_s = value;
        if (adas) adas->ttc_crit_s = value;
        changed = 1;
    } else if (!strcasecmp(name, "bsd_dist")) {
        active_config.bsd_dist_cm = value;
        if (adas) adas->bsd_dist_cm = value;
        changed = 1;
    } else if (!strcasecmp(name, "bsd_speed")) {
        active_config.bsd_speed_kmh = value;
        if (adas) adas->bsd_speed_kmh = value;
        changed = 1;
    } else if (!strcasecmp(name, "overspeed")) {
        active_config.overspeed_kmh = value;
        if (adas) adas->overspeed_kmh = value;
        changed = 1;
    }

    if (changed) {
        Config_Save();
        return 1;
    }
    return 0;
}

void Config_ResetDefaults(ADAS_HandleTypeDef *adas)
{
    memcpy(&active_config, &FACTORY_DEFAULTS, sizeof(Config_t));
    if (adas) {
        adas->fcw_warn_cm   = active_config.fcw_warn_cm;
        adas->fcw_crit_cm   = active_config.fcw_crit_cm;
        adas->ttc_warn_s    = active_config.ttc_warn_s;
        adas->ttc_crit_s    = active_config.ttc_crit_s;
        adas->bsd_dist_cm   = active_config.bsd_dist_cm;
        adas->bsd_speed_kmh = active_config.bsd_speed_kmh;
        adas->overspeed_kmh = active_config.overspeed_kmh;
    }
    Config_Save();
}

void Config_Print(void)
{
    char buf[120];

    DAL_UART_TransmitString("===== SYSTEM CONFIGURATION (NVM) =====\r\n");

    int w, f;

    w = (int)active_config.fcw_warn_cm; f = (int)(active_config.fcw_warn_cm * 10.0f) % 10;
    sprintf(buf, " FCW Warning Distance  : %d.%d cm\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    w = (int)active_config.fcw_crit_cm; f = (int)(active_config.fcw_crit_cm * 10.0f) % 10;
    sprintf(buf, " FCW Critical Distance : %d.%d cm\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    w = (int)active_config.ttc_warn_s; f = (int)(active_config.ttc_warn_s * 10.0f) % 10;
    sprintf(buf, " TTC Warning Time      : %d.%d s\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    w = (int)active_config.ttc_crit_s; f = (int)(active_config.ttc_crit_s * 10.0f) % 10;
    sprintf(buf, " TTC Critical Time     : %d.%d s\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    w = (int)active_config.bsd_dist_cm; f = (int)(active_config.bsd_dist_cm * 10.0f) % 10;
    sprintf(buf, " BSD Range Threshold   : %d.%d cm\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    w = (int)active_config.bsd_speed_kmh; f = (int)(active_config.bsd_speed_kmh * 10.0f) % 10;
    sprintf(buf, " BSD Speed Gate        : %d.%d km/h\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    w = (int)active_config.overspeed_kmh; f = (int)(active_config.overspeed_kmh * 10.0f) % 10;
    sprintf(buf, " Overspeed Limit       : %d.%d km/h\r\n", w, (f < 0 ? -f : f));
    DAL_UART_TransmitString(buf);

    sprintf(buf, " Storage Flash Page    : 0x%08X (CRC: 0x%08lX)\r\n",
            DAL_FLASH_CONFIG_PAGE_ADDR, (unsigned long)active_config.checksum);
    DAL_UART_TransmitString(buf);

    DAL_UART_TransmitString("======================================\r\n");
}
