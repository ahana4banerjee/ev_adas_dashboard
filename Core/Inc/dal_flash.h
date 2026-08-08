/**
 * @file    dal_flash.h
 * @brief   Driver Abstraction Layer (DAL) for On-Chip Flash NVM
 */

#ifndef DAL_FLASH_H
#define DAL_FLASH_H

#include "common.h"

/* STM32F103C8 Page 63 base address: 0x0800FC00 (last 1KB page of 64KB flash) */
#define DAL_FLASH_CONFIG_PAGE_ADDR  0x0800FC00
#define DAL_FLASH_PAGE_SIZE         1024

/**
 * @brief  Erase a 1KB page of on-chip flash.
 * @param  page_address Starting address of the page (e.g. 0x0800FC00)
 * @return 1 on success, 0 on failure
 */
uint8_t DAL_Flash_ErasePage(uint32_t page_address);

/**
 * @brief  Program 32-bit words into on-chip flash memory.
 * @param  address    Target flash memory address
 * @param  data       Pointer to word array
 * @param  word_count Number of 32-bit words to write
 * @return 1 on success, 0 on failure
 */
uint8_t DAL_Flash_Write(uint32_t address, const uint32_t *data, uint32_t word_count);

/**
 * @brief  Read 32-bit words from on-chip flash memory.
 * @param  address    Source flash memory address
 * @param  buffer     Pointer to destination word buffer
 * @param  word_count Number of 32-bit words to read
 */
void DAL_Flash_Read(uint32_t address, uint32_t *buffer, uint32_t word_count);

#endif /* DAL_FLASH_H */
