/**
 * @file    dal_flash.c
 * @brief   Driver Abstraction Layer (DAL) for On-Chip Flash NVM implementation
 */

#include "dal_flash.h"

uint8_t DAL_Flash_ErasePage(uint32_t page_address)
{
    HAL_FLASH_Unlock();

    FLASH_EraseInitTypeDef erase_init;
    erase_init.TypeErase   = FLASH_TYPEERASE_PAGES;
    erase_init.PageAddress = page_address;
    erase_init.NbPages     = 1;

    uint32_t page_error = 0;
    HAL_StatusTypeDef status = HAL_FLASHEx_Erase(&erase_init, &page_error);

    HAL_FLASH_Lock();
    return (status == HAL_OK) ? 1 : 0;
}

uint8_t DAL_Flash_Write(uint32_t address, const uint32_t *data, uint32_t word_count)
{
    if (!data || word_count == 0) return 0;

    HAL_FLASH_Unlock();

    for (uint32_t i = 0; i < word_count; i++) {
        uint32_t target_addr = address + (i * 4);
        HAL_StatusTypeDef status = HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, target_addr, data[i]);
        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return 0;
        }
    }

    HAL_FLASH_Lock();
    return 1;
}

void DAL_Flash_Read(uint32_t address, uint32_t *buffer, uint32_t word_count)
{
    if (!buffer || word_count == 0) return;

    for (uint32_t i = 0; i < word_count; i++) {
        buffer[i] = *(__IO uint32_t*)(address + (i * 4));
    }
}
