"""
Phase 3: Macroeconomic, Semiconductor & Thermodynamic Model
===========================================================
Production-grade financial and physical modeling tool calculating the datacenter,
semiconductor fab, and energy savings when eliminating the AI Host Tax using Ohnrscript DOD.

Accepts configurable parameters:
- Cluster Size (1,000 to 100,000 GPUs)
- Host-to-GPU ratio (default 8 GPUs per host server)
- PUE (Power Usage Effectiveness: 1.10 to 1.35)
- Electricity Rate ($/kWh: $0.06 to $0.18)
- Memory Module Pricing (128GB 3DS-RDIMM vs 64GB Monolithic RDIMM)
- Advanced 300mm EUV Wafer Cost & TSV Stacking Defect Density
"""

import os
import sys
import math
import argparse
import json
from typing import Dict, Any


class DatacenterSavingsModel:
    """Calculates Server BOM, Thermodynamic, Wafer Yield, and GPU ROI metrics."""

    def __init__(
        self,
        cluster_gpus: int = 32000,
        gpus_per_server: int = 8,
        pue: float = 1.20,
        electricity_cost_kwh: float = 0.09,
        cost_128gb_3ds_dimm: float = 1450.0,
        cost_64gb_monolithic_dimm: float = 290.0,
        power_128gb_dimm_w: float = 13.5,
        power_64gb_dimm_w: float = 7.0,
        gpu_hourly_rental_rate: float = 3.20,
        baseline_training_days: float = 90.0,
        training_time_reduction_pct: float = 15.0,
        wafer_diameter_mm: float = 300.0,
        dram_die_size_mm2: float = 55.0,
        tsv_stack_defect_penalty_pct: float = 32.0,  # 3D TSV stacking yield loss
    ):
        self.cluster_gpus = cluster_gpus
        self.gpus_per_server = gpus_per_server
        self.num_servers = cluster_gpus // gpus_per_server
        self.pue = pue
        self.electricity_cost_kwh = electricity_cost_kwh

        self.cost_128gb_3ds_dimm = cost_128gb_3ds_dimm
        self.cost_64gb_monolithic_dimm = cost_64gb_monolithic_dimm
        self.power_128gb_dimm_w = power_128gb_dimm_w
        self.power_64gb_dimm_w = power_64gb_dimm_w

        self.gpu_hourly_rental_rate = gpu_hourly_rental_rate
        self.baseline_training_days = baseline_training_days
        self.training_time_reduction_pct = training_time_reduction_pct

        self.wafer_diameter_mm = wafer_diameter_mm
        self.dram_die_size_mm2 = dram_die_size_mm2
        self.tsv_stack_defect_penalty_pct = tsv_stack_defect_penalty_pct

    def calculate_server_bom_savings(self) -> Dict[str, Any]:
        """Calculates Capital Expenditure (CapEx) savings on Server Host Memory BOM."""
        # Baseline Host Tax Stack: 16x 128GB 3DS-RDIMMs (2.0TB per 8x GPU node)
        baseline_dimms_per_server = 16
        baseline_cost_per_server = baseline_dimms_per_server * self.cost_128gb_3ds_dimm
        baseline_cluster_capex = self.num_servers * baseline_cost_per_server

        # Ohnrscript DOD Stack: 12x 64GB Monolithic RDIMMs (768GB per 8x GPU node)
        ohnr_dimms_per_server = 12
        ohnr_cost_per_server = ohnr_dimms_per_server * self.cost_64gb_monolithic_dimm
        ohnr_cluster_capex = self.num_servers * ohnr_cost_per_server

        net_capex_savings = baseline_cluster_capex - ohnr_cluster_capex
        savings_pct = (net_capex_savings / baseline_cluster_capex) * 100.0

        return {
            "num_servers": self.num_servers,
            "baseline_dimms_per_server": baseline_dimms_per_server,
            "baseline_ram_per_server_gb": baseline_dimms_per_server * 128,
            "baseline_cost_per_server_usd": baseline_cost_per_server,
            "baseline_cluster_capex_usd": baseline_cluster_capex,
            "ohnr_dimms_per_server": ohnr_dimms_per_server,
            "ohnr_ram_per_server_gb": ohnr_dimms_per_server * 64,
            "ohnr_cost_per_server_usd": ohnr_cost_per_server,
            "ohnr_cluster_capex_usd": ohnr_cluster_capex,
            "net_capex_savings_usd": net_capex_savings,
            "capex_savings_percent": round(savings_pct, 2),
        }

    def calculate_thermodynamic_power_savings(self) -> Dict[str, Any]:
        """Calculates DRAM refresh wattage, PUE facility power, annual MWh, and CO2 savings."""
        # Baseline DRAM power: 16 sticks * 13.5W
        baseline_dram_watts_per_server = 16 * self.power_128gb_dimm_w
        # Ohnrscript DRAM power: 12 sticks * 7.0W
        ohnr_dram_watts_per_server = 12 * self.power_64gb_dimm_w

        watts_saved_per_server = baseline_dram_watts_per_server - ohnr_dram_watts_per_server
        # Apply PUE cooling & facility multiplier
        facility_watts_saved_per_server = watts_saved_per_server * self.pue

        cluster_kw_saved = (facility_watts_saved_per_server * self.num_servers) / 1000.0
        annual_mwh_saved = (cluster_kw_saved * 8760.0) / 1000.0
        annual_power_cost_savings = annual_mwh_saved * 1000.0 * self.electricity_cost_kwh

        # Carbon emissions factor (EPA US average ~0.385 metric tons CO2e per MWh)
        co2_tons_abated_per_year = annual_mwh_saved * 0.385

        return {
            "baseline_dram_watts_per_server": baseline_dram_watts_per_server,
            "ohnr_dram_watts_per_server": ohnr_dram_watts_per_server,
            "watts_saved_per_server": watts_saved_per_server,
            "cluster_continuous_kw_saved": round(cluster_kw_saved, 2),
            "annual_mwh_saved": round(annual_mwh_saved, 2),
            "annual_power_cost_savings_usd": round(annual_power_cost_savings, 2),
            "co2_metric_tons_abated_per_year": round(co2_tons_abated_per_year, 2),
        }

    def calculate_semiconductor_wafer_relief(self) -> Dict[str, Any]:
        """Models 300mm silicon wafer capacity freed up across Samsung, SK Hynix, and Micron."""
        # Standard 300mm wafer gross area (mm^2)
        wafer_area_mm2 = math.pi * ((self.wafer_diameter_mm / 2.0) ** 2)
        # Approximate gross dies per wafer using standard fab formula
        gross_dies_per_wafer = (wafer_area_mm2 / self.dram_die_size_mm2) - (
            math.pi * self.wafer_diameter_mm / math.sqrt(2 * self.dram_die_size_mm2)
        )

        # Baseline: 16x 128GB modules per server
        # A 128GB 3DS module uses 32x 32Gb equivalent stacked dies (4-high stacks)
        baseline_dies_per_server = 16 * 32
        # Effective wafer yield with 3D TSV stacking penalty (compound defect loss)
        effective_tsv_dies_per_wafer = gross_dies_per_wafer * (1.0 - (self.tsv_stack_defect_penalty_pct / 100.0))
        baseline_wafers_per_server = baseline_dies_per_server / max(1.0, effective_tsv_dies_per_wafer)
        baseline_total_wafers = baseline_wafers_per_server * self.num_servers

        # Ohnrscript: 12x 64GB monolithic modules per server (16x 32Gb monolithic dies per DIMM)
        ohnr_dies_per_server = 12 * 16
        # Monolithic standard die yield (~90% yield)
        effective_monolithic_dies_per_wafer = gross_dies_per_wafer * 0.90
        ohnr_wafers_per_server = ohnr_dies_per_server / max(1.0, effective_monolithic_dies_per_wafer)
        ohnr_total_wafers = ohnr_wafers_per_server * self.num_servers

        wafers_freed = baseline_total_wafers - ohnr_total_wafers
        wafers_freed_pct = (wafers_freed / baseline_total_wafers) * 100.0

        # Equivalent consumer LPDDR5X / DDR5 smartphone/laptop modules produced with freed silicon
        consumer_dimms_equivalent = wafers_freed * effective_monolithic_dies_per_wafer / 8.0  # 8 dies per 16GB LPDDR5X

        return {
            "gross_dies_per_300mm_wafer": round(gross_dies_per_wafer, 1),
            "baseline_total_300mm_wafers_required": round(baseline_total_wafers, 1),
            "ohnr_total_300mm_wafers_required": round(ohnr_total_wafers, 1),
            "net_300mm_wafers_freed": round(wafers_freed, 1),
            "wafer_capacity_relief_percent": round(wafers_freed_pct, 2),
            "equivalent_consumer_memory_units_freed": int(consumer_dimms_equivalent),
        }

    def calculate_gpu_training_acceleration_roi(self) -> Dict[str, Any]:
        """Calculates financial ROI from eliminating CPU data-loading GPU starvation."""
        total_cluster_gpu_hours = self.cluster_gpus * (self.baseline_training_days * 24.0)
        baseline_run_cost = total_cluster_gpu_hours * self.gpu_hourly_rental_rate

        time_saved_days = self.baseline_training_days * (self.training_time_reduction_pct / 100.0)
        accelerated_training_days = self.baseline_training_days - time_saved_days

        gpu_hours_saved = self.cluster_gpus * (time_saved_days * 24.0)
        operational_cost_savings = gpu_hours_saved * self.gpu_hourly_rental_rate

        return {
            "baseline_training_days": self.baseline_training_days,
            "accelerated_training_days": round(accelerated_training_days, 1),
            "training_days_saved": round(time_saved_days, 1),
            "baseline_cluster_run_cost_usd": baseline_run_cost,
            "operational_cost_savings_usd": operational_cost_savings,
            "savings_percent": self.training_time_reduction_pct,
        }

    def run_full_model(self) -> Dict[str, Any]:
        bom = self.calculate_server_bom_savings()
        power = self.calculate_thermodynamic_power_savings()
        wafer = self.calculate_semiconductor_wafer_relief()
        roi = self.calculate_gpu_training_acceleration_roi()

        total_first_year_savings = bom["net_capex_savings_usd"] + power["annual_power_cost_savings_usd"] + roi["operational_cost_savings_usd"]

        return {
            "cluster_parameters": {
                "cluster_gpus": self.cluster_gpus,
                "gpus_per_server": self.gpus_per_server,
                "num_servers": self.num_servers,
                "pue": self.pue,
                "electricity_cost_kwh": self.electricity_cost_kwh,
            },
            "server_bom_savings": bom,
            "thermodynamic_power_savings": power,
            "semiconductor_wafer_relief": wafer,
            "gpu_training_roi": roi,
            "total_first_year_financial_benefit_usd": round(total_first_year_savings, 2),
        }


def print_formatted_report(m: Dict[str, Any]):
    p = m["cluster_parameters"]
    b = m["server_bom_savings"]
    pw = m["thermodynamic_power_savings"]
    w = m["semiconductor_wafer_relief"]
    r = m["gpu_training_roi"]

    print("================================================================================")
    print(" PHASE 3: MACROECONOMIC, SEMICONDUCTOR & THERMODYNAMIC MODEL")
    print("================================================================================")
    print(f" Cluster Size: {p['cluster_gpus']:,} GPUs ({p['num_servers']:,} 8x GPU Servers) | PUE: {p['pue']} | Power: ${p['electricity_cost_kwh']}/kWh")
    print("--------------------------------------------------------------------------------")
    print(" 1. SERVER BOM & CAPEX SAVINGS:")
    print(f"    - Baseline Host Tax (16x 128GB 3DS-RDIMM / Server): ${b['baseline_cluster_capex_usd']:,.2f}")
    print(f"    - Ohnrscript DOD Stack (12x 64GB Monolithic / Server): ${b['ohnr_cluster_capex_usd']:,.2f}")
    print(f"    -> Direct Server RAM CapEx Savings: ${b['net_capex_savings_usd']:,.2f} ({b['capex_savings_percent']}%)")
    print("--------------------------------------------------------------------------------")
    print(" 2. THERMODYNAMIC & FACILITY POWER SAVINGS:")
    print(f"    - Continuous Power Saved: {pw['cluster_continuous_kw_saved']:,} kW ({pw['watts_saved_per_server']}W / Server)")
    print(f"    - Annual Energy Saved: {pw['annual_mwh_saved']:,.1f} MWh/year")
    print(f"    - Annual Cooling & Electricity OPEX Savings: ${pw['annual_power_cost_savings_usd']:,.2f}/year")
    print(f"    - Carbon Abatement: {pw['co2_metric_tons_abated_per_year']:,.1f} Metric Tons CO2e/year")
    print("--------------------------------------------------------------------------------")
    print(" 3. SEMICONDUCTOR & 300MM EUV FAB WAFER RELIEF:")
    print(f"    - Baseline TSV Wafer Consumption: {w['baseline_total_300mm_wafers_required']:,} wafers")
    print(f"    - Ohnrscript Monolithic Wafer Consumption: {w['ohnr_total_300mm_wafers_required']:,} wafers")
    print(f"    -> Advanced 300mm Silicon Wafers Freed Up: {w['net_300mm_wafers_freed']:,} wafers ({w['wafer_capacity_relief_percent']}%)")
    print(f"    -> Equivalent Consumer LPDDR5X Modules Enabled: {w['equivalent_consumer_memory_units_freed']:,} units")
    print("--------------------------------------------------------------------------------")
    print(" 4. GPU TRAINING ACCELERATION (ELIMINATING STARVATION):")
    print(f"    - Baseline 90-Day Training Run Cost: ${r['baseline_cluster_run_cost_usd']:,.2f}")
    print(f"    - Accelerated Timeline: {r['accelerated_training_days']} days ({r['training_days_saved']} days saved)")
    print(f"    -> Operational GPU Rental Savings: ${r['operational_cost_savings_usd']:,.2f}")
    print("================================================================================")
    print(f" TOTAL FIRST-YEAR FINANCIAL BENEFIT: ${m['total_first_year_financial_benefit_usd']:,.2f}")
    print("================================================================================")


def main():
    parser = argparse.ArgumentParser(description="Phase 3: Macroeconomic & Semiconductor Calculator")
    parser.add_argument("--gpus", type=int, default=32000, help="Cluster GPU count (e.g. 1000 to 100000)")
    parser.add_argument("--pue", type=float, default=1.20, help="Datacenter PUE (e.g. 1.15 to 1.35)")
    parser.add_argument("--kwh-cost", type=float, default=0.09, help="Electricity cost $/kWh")
    parser.add_argument("--price-128gb", type=float, default=1450.0, help="Cost per 128GB 3DS RDIMM")
    parser.add_argument("--price-64gb", type=float, default=290.0, help="Cost per 64GB Monolithic RDIMM")
    parser.add_argument("--out", type=str, default="phase3_model_results.json")
    args = parser.parse_args()

    model = DatacenterSavingsModel(
        cluster_gpus=args.gpus,
        pue=args.pue,
        electricity_cost_kwh=args.kwh_cost,
        cost_128gb_3ds_dimm=args.price_128gb,
        cost_64gb_monolithic_dimm=args.price_64gb,
    )
    results = model.run_full_model()
    print_formatted_report(results)

    with open(args.out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n[Phase 3] Model parameters & metrics exported to: {args.out}")


if __name__ == "__main__":
    main()
