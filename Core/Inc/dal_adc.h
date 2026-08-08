/**
 * @file    dal_adc.h
 * @brief   Driver Abstraction Layer (DAL) for ADC conversions
 */

#ifndef DAL_ADC_H
#define DAL_ADC_H

#include "common.h"

typedef enum {
    DAL_ADC_ACCEL = 0,
    DAL_ADC_BRAKE,
    DAL_ADC_TEMP,
    DAL_ADC_CHANNEL_COUNT
} DAL_ADC_Channel_t;

/**
 * @brief  Initialize the ADC abstraction wrapper.
 * @param  hadc Pointer to STM32 HAL ADC handle
 */
void DAL_ADC_Init(ADC_HandleTypeDef *hadc);

/**
 * @brief  Read the raw 12-bit conversion value (0–4095).
 * @param  ch Target ADC channel enum
 * @return 12-bit ADC raw code
 */
uint16_t DAL_ADC_ReadRaw(DAL_ADC_Channel_t ch);

/**
 * @brief  Read the mapped pedal percentage (0.0% – 100.0%).
 * @param  ch Accelerator or Brake channel enum
 * @return Value scaled between 0.0f and 100.0f
 */
float DAL_ADC_ReadPercent(DAL_ADC_Channel_t ch);

/**
 * @brief  Read linearized motor temperature (0.0°C – 120.0°C).
 * @return Scaled temperature in degrees Celsius
 */
float DAL_ADC_ReadTemperature(void);

#endif /* DAL_ADC_H */
