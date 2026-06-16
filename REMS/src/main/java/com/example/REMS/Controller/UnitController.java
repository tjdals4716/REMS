package com.example.REMS.Controller;

import com.example.REMS.DTO.UnitDTO;
import com.example.REMS.Service.UnitService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/unit")
@RequiredArgsConstructor
public class UnitController {

    private final UnitService unitService;

    // 특정 건물에 호실 추가
    @Operation(summary = "호실 추가 (특정 건물에)")
    @PostMapping("/{uid}/building/{buildingId}")
    public ResponseEntity<UnitDTO> createUnit(@PathVariable("uid") String uid,
                                              @PathVariable("buildingId") Long buildingId,
                                              @RequestBody UnitDTO unitDTO,
                                              @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(unitService.createUnit(uid, buildingId, unitDTO, userDetails));
    }

    // 특정 건물의 호실 전체 조회
    @Operation(summary = "건물별 호실 전체 조회")
    @GetMapping("/{uid}/building/{buildingId}")
    public ResponseEntity<List<UnitDTO>> getUnitsByBuilding(@PathVariable("uid") String uid,
                                                            @PathVariable("buildingId") Long buildingId,
                                                            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(unitService.getUnitsByBuilding(uid, buildingId, userDetails));
    }

    // id로 호실 단건 조회
    @Operation(summary = "id로 호실 조회")
    @GetMapping("/id/{uid}/{id}")
    public ResponseEntity<UnitDTO> findById(@PathVariable("uid") String uid,
                                            @PathVariable("id") Long id,
                                            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(unitService.findById(uid, id, userDetails));
    }

    // 호실 수정
    @Operation(summary = "호실 수정")
    @PutMapping("/{uid}/{id}")
    public ResponseEntity<UnitDTO> updateUnit(@PathVariable("uid") String uid,
                                              @PathVariable("id") Long id,
                                              @RequestBody UnitDTO unitDTO,
                                              @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(unitService.updateUnit(uid, id, unitDTO, userDetails));
    }

    // 호실 삭제
    @Operation(summary = "호실 삭제")
    @DeleteMapping("/delete/{uid}/{id}")
    public ResponseEntity<UnitDTO> deleteUnit(@PathVariable("uid") String uid,
                                              @PathVariable("id") Long id,
                                              @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(unitService.deleteUnit(uid, id, userDetails));
    }
}
